import codecs
import re
from datetime import datetime
from utils.data_model import SIEDataModel, Transaction, Verification

class SIEParser:
    """
    Parser for Swedish SIE 4 files (Standard format for bookkeeping data).
    Handles CP437 encoding and converts to proper Swedish characters.
    """
    
    def __init__(self, file_path):
        self.file_path = file_path
        self.data = {
            'metadata': {},
            'accounts': {},
            'verifications': [],
            'ib': {},  # Ingående balans (Opening balance)
            'ub': {},  # Utgående balans (Closing balance)
            'res': {}  # Resultat (Result)
        }
        self.program_info = {
            'name': None,
            'version': None
        }
        self.data_model = SIEDataModel()
    
    def parse(self):
        """Parse the SIE file and return structured data."""
        try:
            # Open with CP437 encoding to properly handle Swedish characters
            with codecs.open(self.file_path, 'r', encoding='cp437') as file:
                current_ver = None
                in_verification_block = False
                
                for line in file:
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Parse different section types
                    if line.startswith('#FLAGGA'):
                        self._parse_flagga(line)
                    elif line.startswith('#PROGRAM'):
                        self._parse_program(line)
                    elif line.startswith('#FORMAT'):
                        self._parse_format(line)
                    elif line.startswith('#GEN'):
                        self._parse_gen(line)
                    elif line.startswith('#SIETYP'):
                        self._parse_sietyp(line)
                    elif line.startswith('#FNAMN'):
                        self._parse_fnamn(line)
                    elif line.startswith('#ORGNR'):
                        self._parse_orgnr(line)
                    elif line.startswith('#ADRESS'):
                        self._parse_adress(line)
                    elif line.startswith('#KPTYP'):
                        self._parse_kptyp(line)
                    elif line.startswith('#KONTO'):
                        self._parse_konto(line)
                    elif line.startswith('#SRU'):
                        self._parse_sru(line)
                    elif line.startswith('#IB'):
                        self._parse_ib(line)
                    elif line.startswith('#UB'):
                        self._parse_ub(line)
                    elif line.startswith('#RES'):
                        self._parse_res(line)
                    elif line.startswith('#VER') or line.startswith('VER '):
                        # Start a new verification
                        if current_ver and not in_verification_block:
                            self.data['verifications'].append(current_ver)
                        current_ver = self._parse_ver(line)
                    elif line.startswith('#TRANS') and current_ver:
                        # Add transaction to current verification
                        self._parse_trans(line, current_ver)
                    elif line.startswith('#RTRANS') and current_ver:
                        # Add reversed transaction to current verification
                        self._parse_rtrans(line, current_ver)
                    elif line.startswith('#BTRANS') and current_ver:
                        # Add budget transaction
                        self._parse_btrans(line)
                    elif line.startswith('{'):
                        # Start of verification block
                        in_verification_block = True
                    elif line.startswith('}'):
                        # End of verification block
                        if current_ver:
                            self.data['verifications'].append(current_ver)
                            current_ver = None
                        in_verification_block = False
                
                # Add the last verification if not already added
                if current_ver and not in_verification_block:
                    self.data['verifications'].append(current_ver)
                
                try:
                    # Calculate account balances
                    print("Calculating account balances...")
                    self._calculate_account_balances()
                    print("Account balances calculated successfully")
                    
                    # Process data
                    print("Processing data...")
                    self._process_data()
                    print("Data processed successfully")
                    
                    # Convert to standardized data model
                    print("Converting to standardized data model...")
                    print(f"Verification count: {len(self.data['verifications'])}")
                    if len(self.data['verifications']) > 0:
                        print(f"First verification type: {type(self.data['verifications'][0])}")
                        print(f"First verification attributes: {dir(self.data['verifications'][0])}")
                        if hasattr(self.data['verifications'][0], 'transactions'):
                            print(f"First verification transactions type: {type(self.data['verifications'][0].transactions)}")
                            print(f"First verification transactions count: {len(self.data['verifications'][0].transactions)}")
                            if len(self.data['verifications'][0].transactions) > 0:
                                print(f"First transaction type: {type(self.data['verifications'][0].transactions[0])}")
                                print(f"First transaction attributes: {dir(self.data['verifications'][0].transactions[0])}")
                    
                    # Create a deep copy of the data to avoid modifying the original
                    import copy
                    data_copy = copy.deepcopy(self.data)
                    
                    # Convert verifications to dictionaries before passing to data model
                    for i, ver in enumerate(data_copy['verifications']):
                        if hasattr(ver, 'to_dict'):
                            data_copy['verifications'][i] = ver.to_dict()
                        elif hasattr(ver, '__dict__'):
                            data_copy['verifications'][i] = ver.__dict__
                    
                    self.data_model = SIEDataModel().from_parser_data(data_copy)
                    print("Conversion to data model successful")
                    
                    return self.data_model.to_dict()
                except Exception as e:
                    import traceback
                    print(f"Error in data processing: {e}")
                    print(traceback.format_exc())
                    return None
                
        except Exception as e:
            print(f"Error parsing SIE file: {e}")
            import traceback
            print(traceback.format_exc())
            return None
    
    def _extract_quoted_string(self, text):
        """Extract string enclosed in quotes."""
        match = re.search(r'"([^"]*)"', text)
        if match:
            return match.group(1)
        return ""
    
    def _extract_values(self, line):
        """Extract all values from a line, respecting quoted strings."""
        values = []
        parts = line.split(' ')
        i = 0
        
        while i < len(parts):
            if parts[i].startswith('"'):
                # Start of a quoted string
                quoted_value = parts[i]
                
                # If the quote isn't closed in this part, continue to the next parts
                while i + 1 < len(parts) and not quoted_value.endswith('"'):
                    i += 1
                    quoted_value += ' ' + parts[i]
                
                # Remove the quotes and add to values
                values.append(quoted_value[1:-1] if quoted_value.endswith('"') else quoted_value[1:])
            elif parts[i]:  # Skip empty parts
                # Clean up the value - remove any non-standard characters that might affect parsing
                clean_value = parts[i].strip()
                values.append(clean_value)
            
            i += 1
        
        return values
    
    def _parse_flagga(self, line):
        """Parse #FLAGGA section (flags)."""
        parts = line.split(' ')
        if len(parts) > 1:
            self.data['metadata']['flagga'] = parts[1]
    
    def _parse_program(self, line):
        """Parse #PROGRAM section (source program)."""
        program_string = self._extract_quoted_string(line)
        self.data['metadata']['program'] = program_string
        
        # Extract program name and version
        if program_string:
            # Try to extract program name and version
            # Format is typically "Program Name" Version
            parts = program_string.split('"')
            if len(parts) > 1:
                self.program_info['name'] = parts[1].strip()
                if len(parts) > 2 and parts[2].strip():
                    self.program_info['version'] = parts[2].strip()
            else:
                # Alternative format without quotes
                parts = program_string.split()
                if parts:
                    self.program_info['name'] = parts[0]
                    if len(parts) > 1:
                        self.program_info['version'] = parts[1]
    
    def _parse_format(self, line):
        """Parse #FORMAT section (SIE format)."""
        parts = line.split(' ')
        if len(parts) > 1:
            self.data['metadata']['format'] = parts[1]
    
    def _parse_gen(self, line):
        """Parse #GEN section (generation date)."""
        parts = line.split(' ')
        if len(parts) > 1:
            self.data['metadata']['gen_date'] = parts[1]
    
    def _parse_sietyp(self, line):
        """Parse #SIETYP section (SIE type)."""
        parts = line.split(' ')
        if len(parts) > 1:
            self.data['metadata']['sie_type'] = parts[1]
    
    def _parse_fnamn(self, line):
        """Parse #FNAMN section (company name)."""
        self.data['metadata']['company_name'] = self._extract_quoted_string(line)
    
    def _parse_orgnr(self, line):
        """Parse #ORGNR section (organization number)."""
        parts = line.split(' ')
        if len(parts) > 1:
            self.data['metadata']['org_number'] = parts[1]
    
    def _parse_rar(self, line):
        """Parse #RAR section (fiscal year)."""
        parts = self._extract_values(line)
        if len(parts) >= 3:
            year_id = parts[1]
            start_date = parts[2]
            end_date = parts[3] if len(parts) > 3 else None
            
            if 'fiscal_years' not in self.data['metadata']:
                self.data['metadata']['fiscal_years'] = {}
            
            self.data['metadata']['fiscal_years'][year_id] = {
                'start_date': start_date,
                'end_date': end_date
            }
    
    def _parse_konto(self, line):
        """Parse #KONTO section (account)."""
        parts = self._extract_values(line)
        if len(parts) >= 2:
            account_number = parts[1]
            account_name = parts[2] if len(parts) > 2 else ""
            
            self.data['accounts'][account_number] = {
                'name': account_name,
                'type': self._determine_account_type(account_number)
            }
    
    def _parse_ib(self, line):
        """Parse #IB section (opening balance)."""
        parts = self._extract_values(line)
        if len(parts) >= 3:
            year = parts[1]
            account = parts[2]
            amount = float(parts[3]) if len(parts) > 3 else 0.0
            
            if year not in self.data['ib']:
                self.data['ib'][year] = {}
            
            self.data['ib'][year][account] = amount
    
    def _parse_ub(self, line):
        """Parse #UB section (closing balance)."""
        parts = self._extract_values(line)
        if len(parts) >= 3:
            year = parts[1]
            account = parts[2]
            amount = float(parts[3]) if len(parts) > 3 else 0.0
            
            if year not in self.data['ub']:
                self.data['ub'][year] = {}
            
            self.data['ub'][year][account] = amount
    
    def _parse_res(self, line):
        """Parse #RES section (result)."""
        parts = self._extract_values(line)
        if len(parts) >= 3:
            year = parts[1]
            account = parts[2]
            amount = float(parts[3]) if len(parts) > 3 else 0.0
            
            if year not in self.data['res']:
                self.data['res'][year] = {}
            
            self.data['res'][year][account] = amount
    
    def _parse_ver(self, line):
        """Parse #VER section (verification)."""
        # Handle both #VER and VER formats
        if line.startswith('#'):
            line = line[1:]  # Remove the # if present
        
        parts = self._extract_values(line)
        series = ""
        ver_number = ""
        ver_date = ""
        ver_text = ""
        ver_reg_date = ""  # For registration date if present
        
        # Handle different VER formats according to SIE 4 standard
        if parts[0] == "VER":
            # Format: VER series number date "text" reg_date
            if len(parts) >= 2:
                series = parts[1]
            if len(parts) >= 3:
                ver_number = parts[2]
            if len(parts) >= 4:
                ver_date = parts[3]
            if len(parts) >= 5:
                ver_text = parts[4]
            if len(parts) >= 6:
                ver_reg_date = parts[5]
        else:
            # Standard #VER format
            if len(parts) >= 2:
                series = parts[1]
            if len(parts) >= 3:
                ver_number = parts[2]
            if len(parts) >= 4:
                ver_date = parts[3]
            if len(parts) >= 5:
                ver_text = parts[4]
        
        # Format date if it's in YYYYMMDD format
        if ver_date and len(ver_date) == 8 and ver_date.isdigit():
            ver_date = f"{ver_date[:4]}-{ver_date[4:6]}-{ver_date[6:8]}"
        
        print(f"Creating verification: series={series}, number={ver_number}, date={ver_date}, text={ver_text}")
        
        # Create a Verification object with keyword arguments
        verification = Verification(
            series=series,
            number=ver_number,
            date=ver_date,
            text=ver_text
        )
        
        # Store registration date if available
        if ver_reg_date:
            verification.reg_date = ver_reg_date
        
        # Initialize the transactions list
        verification.transactions = []
        
        return verification
    
    def _parse_trans(self, line, current_ver):
        """Parse #TRANS section (transaction)."""
        if line.startswith('#'):
            line = line[1:]  # Remove the # if present
            
        parts = self._extract_values(line)
        account = ""
        amount = 0.0
        trans_date = ""
        trans_text = ""
        object_info = ""
        quantity = 0.0
        sign = ""  # For signature/user info
        
        # According to SIE 4 standard, the format for TRANS is:
        # #TRANS account object_info amount trans_date trans_text quantity sign
        
        # Get account number (always in position 1)
        if len(parts) >= 2:
            account = parts[1]
        
        # Parse object info (position 2)
        if len(parts) >= 3:
            # Object info can be {} or {dimension "value"}
            if parts[2] == '{}' or (parts[2].startswith('{') and parts[2].endswith('}')):
                object_info = parts[2]
            else:
                # If it's a multi-part object notation, collect all parts
                if parts[2].startswith('{') and not parts[2].endswith('}'):
                    object_parts = [parts[2]]
                    i = 3
                    while i < len(parts) and not parts[i].endswith('}'):
                        object_parts.append(parts[i])
                        i += 1
                    
                    if i < len(parts):
                        object_parts.append(parts[i])  # Add the closing part
                        object_info = ' '.join(object_parts)
                        
                        # Adjust parts list to skip the object parts we've processed
                        new_parts = parts[:2] + parts[i+1:]
                        parts = new_parts
        
        # Parse amount (position 3 after accounting for object info)
        if len(parts) >= 4:
            try:
                # Handle both dot and comma as decimal separators
                amount_str = parts[3].replace(',', '.')
                amount = float(amount_str)
            except (ValueError, TypeError):
                pass
        
        # Parse transaction date if present (position 4)
        if len(parts) >= 5:
            if len(parts[4]) == 8 and parts[4].isdigit():
                # Format: YYYYMMDD
                trans_date = f"{parts[4][:4]}-{parts[4][4:6]}-{parts[4][6:8]}"
            elif parts[4] and parts[4] != '""':
                # If not a date, it might be text
                if parts[4].startswith('"') and parts[4].endswith('"'):
                    trans_text = parts[4][1:-1]  # Remove quotes
                else:
                    trans_text = parts[4]
        
        # Parse transaction text if present (position 5)
        if len(parts) >= 6 and not trans_text:
            if parts[5].startswith('"') and parts[5].endswith('"'):
                trans_text = parts[5][1:-1]  # Remove quotes
            else:
                trans_text = parts[5]
        
        # Parse quantity if present (position 6)
        if len(parts) >= 7:
            try:
                quantity = float(parts[6])
            except (ValueError, TypeError):
                pass
        
        # Parse signature/user if present (position 7)
        if len(parts) >= 8:
            if parts[7].startswith('"') and parts[7].endswith('"'):
                sign = parts[7][1:-1]  # Remove quotes
            else:
                sign = parts[7]
        
        # If no transaction date was provided, use the verification date
        if not trans_date and current_ver and hasattr(current_ver, 'date'):
            trans_date = current_ver.date
        
        print(f"Parsed transaction: Account={account}, Amount={amount}, Date={trans_date}, Text={trans_text}, Object={object_info}, Quantity={quantity}, Sign={sign}")
        
        # Create a Transaction object
        transaction = Transaction(
            account=account,
            amount=amount,
            date=trans_date,
            text=trans_text
        )
        
        # Add additional properties if available
        if object_info:
            transaction.object_info = object_info
        if quantity != 0.0:
            transaction.quantity = quantity
        if sign:
            transaction.sign = sign
        
        # Add account name if available
        if account in self.data['accounts']:
            transaction.account_name = self.data['accounts'][account].get('name', '')
        
        # Add transaction to current verification
        if current_ver and hasattr(current_ver, 'transactions'):
            current_ver.transactions.append(transaction)
        
        return transaction
    
    def _parse_rtrans(self, line, current_ver):
        """Parse #RTRANS section (reversed transaction)."""
        # RTRANS follows the same format as TRANS according to SIE 4 standard
        if line.startswith('#'):
            line = line[1:]  # Remove the # if present
            
        parts = self._extract_values(line)
        account = ""
        amount = 0.0
        trans_date = ""
        trans_text = ""
        object_info = ""
        quantity = 0.0
        sign = ""  # For signature/user info
        
        # According to SIE 4 standard, the format for RTRANS is:
        # #RTRANS account object_info amount trans_date trans_text quantity sign
        
        # Get account number (always in position 1)
        if len(parts) >= 2:
            account = parts[1]
        
        # Parse object info (position 2)
        if len(parts) >= 3:
            # Object info can be {} or {dimension "value"}
            if parts[2] == '{}' or (parts[2].startswith('{') and parts[2].endswith('}')):
                object_info = parts[2]
            else:
                # If it's a multi-part object notation, collect all parts
                if parts[2].startswith('{') and not parts[2].endswith('}'):
                    object_parts = [parts[2]]
                    i = 3
                    while i < len(parts) and not parts[i].endswith('}'):
                        object_parts.append(parts[i])
                        i += 1
                    
                    if i < len(parts):
                        object_parts.append(parts[i])  # Add the closing part
                        object_info = ' '.join(object_parts)
                        
                        # Adjust parts list to skip the object parts we've processed
                        new_parts = parts[:2] + parts[i+1:]
                        parts = new_parts
        
        # Parse amount (position 3 after accounting for object info)
        if len(parts) >= 4:
            try:
                # Handle both dot and comma as decimal separators
                amount_str = parts[3].replace(',', '.')
                # For RTRANS, negate the amount
                amount = -float(amount_str)
            except (ValueError, TypeError):
                pass
        
        # Parse transaction date if present (position 4)
        if len(parts) >= 5:
            if len(parts[4]) == 8 and parts[4].isdigit():
                # Format: YYYYMMDD
                trans_date = f"{parts[4][:4]}-{parts[4][4:6]}-{parts[4][6:8]}"
            elif parts[4] and parts[4] != '""':
                # If not a date, it might be text
                if parts[4].startswith('"') and parts[4].endswith('"'):
                    trans_text = parts[4][1:-1]  # Remove quotes
                else:
                    trans_text = parts[4]
        
        # Parse transaction text if present (position 5)
        if len(parts) >= 6 and not trans_text:
            if parts[5].startswith('"') and parts[5].endswith('"'):
                trans_text = parts[5][1:-1]  # Remove quotes
            else:
                trans_text = parts[5]
        
        # Parse quantity if present (position 6)
        if len(parts) >= 7:
            try:
                quantity = float(parts[6])
            except (ValueError, TypeError):
                pass
        
        # Parse signature/user if present (position 7)
        if len(parts) >= 8:
            if parts[7].startswith('"') and parts[7].endswith('"'):
                sign = parts[7][1:-1]  # Remove quotes
            else:
                sign = parts[7]
        
        # If no transaction date was provided, use the verification date
        if not trans_date and current_ver and hasattr(current_ver, 'date'):
            trans_date = current_ver.date
        
        print(f"Parsed RTRANS: Account={account}, Amount={amount}, Date={trans_date}, Text={trans_text}, Object={object_info}, Quantity={quantity}, Sign={sign}")
        
        # Create a Transaction object
        transaction = Transaction(
            account=account,
            amount=amount,
            date=trans_date,
            text=trans_text
        )
        
        # Add additional properties if available
        if object_info:
            transaction.object_info = object_info
        if quantity != 0.0:
            transaction.quantity = quantity
        if sign:
            transaction.sign = sign
        
        # Add account name if available
        if account in self.data['accounts']:
            transaction.account_name = self.data['accounts'][account].get('name', '')
        
        # Add transaction to current verification
        if current_ver and hasattr(current_ver, 'transactions'):
            current_ver.transactions.append(transaction)
        
        return transaction
    
    def _parse_btrans(self, line):
        """Parse #BTRANS section (budget transaction)."""
        # Budget transactions are not currently used in the data model
        # but we parse them to avoid errors
        pass
    
    def _determine_account_type(self, account_number):
        """Determine account type based on Swedish BAS standard."""
        if not account_number:
            return "unknown"
            
        account_int = int(account_number)
        
        if 1000 <= account_int < 2000:
            return "asset"
        elif 2000 <= account_int < 3000:
            return "liability"
        elif 3000 <= account_int < 4000:
            return "equity_or_liability"
        elif 4000 <= account_int < 8000:
            return "income_statement"
        else:
            return "other"
    
    def _process_data(self):
        """Process and organize the parsed data."""
        # Calculate transaction totals per account
        account_totals = {}
        
        for ver in self.data['verifications']:
            # Check if ver is a Verification object or a dictionary
            if hasattr(ver, 'transactions'):
                transactions = ver.transactions
            else:
                transactions = ver.get('transactions', [])
                
            for trans in transactions:
                # Check if trans is a Transaction object or a dictionary
                if hasattr(trans, 'account'):
                    account = trans.account
                    amount = trans.amount
                else:
                    account = trans.get('account', '')
                    amount = trans.get('amount', 0)
                
                if account not in account_totals:
                    account_totals[account] = 0
                
                account_totals[account] += amount
        
        self.data['account_totals'] = account_totals
        
        # Add account names to transactions for easier reference
        for ver in self.data['verifications']:
            # Check if ver is a Verification object or a dictionary
            if hasattr(ver, 'transactions'):
                transactions = ver.transactions
            else:
                transactions = ver.get('transactions', [])
                
            for trans in transactions:
                # Check if trans is a Transaction object or a dictionary
                if hasattr(trans, 'account'):
                    account = trans.account
                    # Use setattr for Transaction objects
                    if account in self.data['accounts']:
                        if isinstance(self.data['accounts'][account], dict):
                            account_name = self.data['accounts'][account].get('name', "Unknown")
                        else:
                            account_name = getattr(self.data['accounts'][account], 'name', "Unknown")
                        setattr(trans, 'account_name', account_name)
                    else:
                        setattr(trans, 'account_name', "Unknown")
                else:
                    account = trans.get('account', '')
                    # Use dictionary assignment for dictionary transactions
                    if account in self.data['accounts']:
                        if isinstance(self.data['accounts'][account], dict):
                            trans['account_name'] = self.data['accounts'][account].get('name', "Unknown")
                        else:
                            trans['account_name'] = getattr(self.data['accounts'][account], 'name', "Unknown")
                    else:
                        trans['account_name'] = "Unknown"

    def _calculate_account_balances(self):
        """Calculate account balances based on transactions."""
        # Initialize account balances
        account_balances = {}
        
        # Add opening balances
        for year, balances in self.data.get('ib', {}).items():
            for account, amount in balances.items():
                if account not in account_balances:
                    account_balances[account] = 0
                account_balances[account] += amount
        
        # Add transaction amounts
        for ver in self.data['verifications']:
            # Check if ver is a Verification object or a dictionary
            if hasattr(ver, 'transactions'):
                transactions = ver.transactions
            else:
                transactions = ver.get('transactions', [])
                
            for trans in transactions:
                # Check if trans is a Transaction object or a dictionary
                if hasattr(trans, 'account'):
                    account = trans.account
                    amount = trans.amount
                else:
                    account = trans.get('account', '')
                    amount = trans.get('amount', 0)
                
                if account not in account_balances:
                    account_balances[account] = 0
                account_balances[account] += amount
        
        # Store account balances
        self.data['account_balances'] = account_balances

    def _parse_adress(self, line):
        """Parse #ADRESS section (company address)."""
        parts = self._extract_values(line)
        if len(parts) >= 2:
            self.data['metadata']['address'] = parts[1]
        if len(parts) >= 3:
            self.data['metadata']['postal_code'] = parts[2]
        if len(parts) >= 4:
            self.data['metadata']['city'] = parts[3]
    
    def _parse_kptyp(self, line):
        """Parse #KPTYP section (account type)."""
        parts = self._extract_values(line)
        if len(parts) >= 2:
            self.data['metadata']['account_type'] = parts[1]
    
    def _parse_sru(self, line):
        """Parse #SRU section (SRU code)."""
        parts = self._extract_values(line)
        if len(parts) >= 3:
            account = parts[1]
            sru_code = parts[2]
            
            if account in self.data['accounts']:
                self.data['accounts'][account]['sru_code'] = sru_code
