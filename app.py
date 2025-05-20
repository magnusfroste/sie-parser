import os
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from utils.sie_parser import SIEParser
from utils.data_processor import add_description
from utils.data_model import SIEDataModel

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload
app.config['ALLOWED_EXTENSIONS'] = {'se', 'sie'}

# Create upload directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/test')
def test():
    return render_template('test.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        try:
            # Secure the filename
            filename = secure_filename(file.filename)
            
            # Create a temporary file path
            temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            file_path = os.path.join(temp_dir, filename)
            
            # Save the file temporarily
            file.save(file_path)
            
            print(f"File saved to {file_path}")
            
            # Parse the SIE file
            parser = SIEParser(file_path)
            sie_data = parser.parse()
            
            if sie_data is None:
                print("Parser returned None")
                return jsonify({
                    'status': 'error',
                    'error': 'Failed to parse SIE file. The file may be corrupted or in an unsupported format.'
                }), 400
            
            # Add detailed logging about the parsed data
            print(f"SIE data keys: {sie_data.keys() if isinstance(sie_data, dict) else 'Not a dictionary'}")
            
            # Check for result data
            print("Checking for result data:")
            if 'results' in sie_data and sie_data['results']:
                print(f"Results keys: {sie_data['results'].keys()}")
                for year, year_data in sie_data['results'].items():
                    print(f"Year {year} has {len(year_data)} result entries")
                    for acc, value in list(year_data.items())[:5]:  # Show first 5 entries
                        print(f"  Account {acc}: {value}")
            else:
                print("WARNING: No results data found in SIE data!")
                # If we still don't have results, try to parse the file again with the raw parser
                print("Attempting to recover results data...")
                try:
                    parser = SIEParser(file_path)
                    raw_data = parser.parse_raw()  # Parse without converting to data model
                    if raw_data and 'res' in raw_data and raw_data['res']:
                        print(f"Raw RES data found: {raw_data['res']}")
                        # Convert raw RES data to the expected format
                        results_data = {}
                        for year, accounts in raw_data['res'].items():
                            if year not in results_data:
                                results_data[year] = {}
                            for acc_num, amount in accounts.items():
                                results_data[year][acc_num] = {
                                    'account': acc_num,
                                    'amount': float(amount),
                                    'year': year
                                }
                        # Add the recovered results to the sie_data
                        if results_data:
                            print(f"Adding recovered results data: {results_data}")
                            sie_data['results'] = results_data
                    else:
                        print("No 'res' data found in raw parser data either!")
                except Exception as e:
                    print(f"Error recovering results data: {e}")
                    import traceback
                    print(traceback.format_exc())
            
            # The data is already processed through our standardized model
            # No need for additional processing
            
            # Debug the data being sent to the frontend
            print("=== DATA BEING SENT TO FRONTEND ===")
            import json
            print("Balance Sheet:", json.dumps(sie_data.get('balance_sheet', {}), indent=2, default=str))
            print("Income Statement:", json.dumps(sie_data.get('income_statement', {}), indent=2, default=str))
            print("Opening Balances:", json.dumps(sie_data.get('opening_balances', {}), indent=2, default=str))
            print("Results:", json.dumps(sie_data.get('results', {}), indent=2, default=str))
            print("Account Types:", {acc_num: acc.get('type', '') for acc_num, acc in sie_data.get('accounts', {}).items()})
            print("=== END OF DATA ===")
            
            # Clean up: Remove the temporary file at the end of processing
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"Temporary file {file_path} removed successfully")
                except Exception as e:
                    print(f"Warning: Could not remove temporary file {file_path}: {e}")
            
            return jsonify({
                'status': 'success',
                'data': sie_data,
                'message': 'File successfully processed'
            })
        except Exception as e:
            import traceback
            print(f"Error processing file: {e}")
            print(traceback.format_exc())
            
            # Clean up: Remove the temporary file if there was an error
            if 'file_path' in locals() and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    print(f"Temporary file {file_path} removed after error")
                except Exception as cleanup_error:
                    print(f"Warning: Could not remove temporary file after error: {cleanup_error}")
            
            return jsonify({
                'status': 'error',
                'error': f'Error processing file: {str(e)}'
            }), 500
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/add-description', methods=['POST'])
def add_file_description():
    data = request.json
    if not data or 'data' not in data or 'description' not in data:
        return jsonify({'error': 'Missing data or description'}), 400
    
    enhanced_data = add_description(data['data'], data['description'])
    
    return jsonify({
        'status': 'success',
        'data': enhanced_data
    })

@app.route('/save', methods=['POST'])
def save_json():
    data = request.json
    if not data or 'data' not in data or 'filename' not in data:
        return jsonify({'error': 'Missing data or filename'}), 400
    
    filename = secure_filename(data['filename'])
    if not filename.endswith('.json'):
        filename += '.json'
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        import json
        json.dump(data['data'], f, ensure_ascii=False, indent=2)
    
    return jsonify({
        'status': 'success',
        'message': 'File saved successfully',
        'path': filepath
    })

@app.route('/download/<filename>')
def download_file(filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5054)
