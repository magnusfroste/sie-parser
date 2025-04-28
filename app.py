import os
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from utils.sie_parser import SIEParser
from utils.data_processor import process_for_llm, add_description

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
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Parse SIE file
        parser = SIEParser(filepath)
        sie_data = parser.parse()
        
        # Process data for LLM
        processed_data = process_for_llm(sie_data)
        
        return jsonify({
            'status': 'success',
            'data': processed_data,
            'message': 'File successfully processed'
        })
    
    return jsonify({'error': 'File type not allowed'}), 400

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
    app.run(debug=True, port=5019)
