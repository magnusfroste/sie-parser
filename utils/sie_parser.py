import codecs
import re
from datetime import datetime

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
    
    def parse(self):
        """Parse the SIE file and return structured data."""
        try:
            # Open with CP437 encoding to properly handle Swedish characters
            with codecs.open(self.file_path, 'r', encoding='cp437') as file:
                current_ver = None
                
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
                    elif line.startswith('#RAR'):
                        self._parse_rar(line)
                    elif line.startswith('#KONTO'):
                        self._parse_konto(line)
                    elif line.startswith('#IB'):
                        self._parse_ib(line)
                    elif line.startswith('#UB'):
                        self._parse_ub(line)
                    elif line.startswith('#RES'):
                        self._parse_res(line)
                    elif line.startswith('#VER'):
                        current_ver = self._parse_ver(line)
                        self.data['verifications'].append(current_ver)
                    elif line.startswith('#TRANS') and current_ver is not None:
                        self._parse_trans(line, current_ver)
                
                # Process and organize the data
                self._process_data()
                
                return self.data
                
        except Exception as e:
            raise Exception(f"Error parsing SIE file: {str(e)}")
    
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
                values.append(parts[i])
            
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
        parts = self._extract_values(line)
        series = ""
        ver_number = ""
        ver_date = ""
        ver_text = ""
        
        if len(parts) >= 2:
            series = parts[1]
        if len(parts) >= 3:
            ver_number = parts[2]
        if len(parts) >= 4:
            ver_date = parts[3]
        if len(parts) >= 5:
            ver_text = parts[4]
        
        return {
            'series': series,
            'number': ver_number,
            'date': ver_date,
            'text': ver_text,
            'transactions': []
        }
    
    def _parse_trans(self, line, current_ver):
        """Parse #TRANS section (transaction)."""
        parts = self._extract_values(line)
        account = ""
        amount = 0.0
        trans_date = ""
        trans_text = ""
        
        # Apply program-specific parsing rules
        program_name = self.program_info['name'].lower() if self.program_info['name'] else ""
        
        if program_name == "dooer" or program_name == "dooer ledger":
            # Dooer specific parsing
            if len(parts) >= 2:
                account = parts[1]
            if len(parts) >= 3:
                # In Dooer, the amount is typically in position 2
                try:
                    amount = float(parts[2])
                except ValueError:
                    amount = 0.0
            if len(parts) >= 4:
                # In Dooer, the date is typically in position 4 (YYYYMMDD format)
                if len(parts[3]) == 8 and parts[3].isdigit():
                    trans_date = parts[3]
                else:
                    trans_text = parts[3]
            if len(parts) >= 5:
                if not trans_text:
                    trans_text = parts[4]
                    
        elif program_name == "fortnox":
            # Fortnox specific parsing
            if len(parts) >= 2:
                account = parts[1]
            if len(parts) >= 3:
                try:
                    amount = float(parts[2])
                except ValueError:
                    amount = 0.0
            if len(parts) >= 4:
                trans_date = parts[3]
            if len(parts) >= 5:
                trans_text = parts[4]
                
        elif program_name == "bokio":
            # Bokio specific parsing
            if len(parts) >= 2:
                account = parts[1]
            if len(parts) >= 3:
                # In Bokio, the amount is often in the first position (verification number)
                # or in the second position (date)
                if current_ver and 'number' in current_ver:
                    try:
                        # Try to convert verification number to float
                        ver_amount = float(current_ver['number'])
                        if ver_amount != 0:
                            amount = ver_amount
                            # Store the original verification number in a new field
                            if 'original_number' not in current_ver:
                                current_ver['original_number'] = current_ver['number']
                            # Use a standard verification format (V1, V2, etc.)
                            if not current_ver.get('series'):
                                current_ver['series'] = 'V'
                            # Extract verification number from the original verification data
                            if not current_ver['number'] or current_ver['number'] == str(ver_amount):
                                # If the number is just the amount, use the index in the file
                                ver_index = len(self.data['verifications']) + 1
                                current_ver['number'] = str(ver_index)
                    except (ValueError, TypeError):
                        pass
                
                # If amount is still 0, check the date field
                if amount == 0 and current_ver and 'date' in current_ver:
                    try:
                        # Try to convert date to float if it's not a valid date format
                        if not (len(current_ver['date']) == 8 and current_ver['date'].isdigit()):
                            date_amount = float(current_ver['date'].replace('-', '.'))
                            if date_amount != 0:
                                amount = date_amount
                                # Store the original date in a new field
                                if 'original_date' not in current_ver:
                                    current_ver['original_date'] = current_ver['date']
                                # Use transaction date instead
                                if len(parts) >= 4 and len(parts[3]) == 8 and parts[3].isdigit():
                                    current_ver['date'] = parts[3]
                                else:
                                    # Use a default date if none available
                                    current_ver['date'] = self.data['metadata'].get('date', '')
                        else:
                            # Try to parse the amount from position 2
                            try:
                                amount = float(parts[2])
                            except ValueError:
                                amount = 0.0
                    except (ValueError, TypeError):
                        # If conversion fails, try the standard position
                        try:
                            amount = float(parts[2])
                        except ValueError:
                            amount = 0.0
                else:
                    # Try standard position if other methods failed
                    try:
                        amount = float(parts[2])
                    except ValueError:
                        amount = 0.0
            
            if len(parts) >= 4:
                # Check if this is a date (YYYYMMDD format)
                if len(parts[3]) == 8 and parts[3].isdigit():
                    trans_date = parts[3]
                else:
                    trans_text = parts[3]
            if len(parts) >= 5:
                if not trans_text:
                    trans_text = parts[4]
                
        else:
            # Generic parsing with smart detection for unknown programs
            if len(parts) >= 2:
                account = parts[1]
            if len(parts) >= 3:
                try:
                    amount = float(parts[2])
                except ValueError:
                    amount = 0.0
            if len(parts) >= 4:
                # Check if this is a date (YYYYMMDD format) or possibly an amount
                if len(parts[3]) == 8 and parts[3].isdigit():
                    trans_date = parts[3]
                else:
                    # This might be an amount in some SIE formats
                    try:
                        # If we can convert it to a float, it's probably an amount
                        second_amount = float(parts[3])
                        # If the previous amount is 0 or this looks more like an amount, use this one
                        if amount == 0.0 or (abs(second_amount) > 1000 and abs(amount) < 100):
                            amount = second_amount
                    except ValueError:
                        # Not a number, treat as text
                        if not trans_text:
                            trans_text = parts[3]
            if len(parts) >= 5:
                # Check if this might be a date that was in position 5 instead of 4
                if len(parts[4]) == 8 and parts[4].isdigit() and not trans_date:
                    trans_date = parts[4]
                else:
                    trans_text = parts[4]
        
        # If we still don't have a date, use the verification date
        if not trans_date:
            trans_date = current_ver['date']
            
        transaction = {
            'account': account,
            'amount': amount,
            'date': trans_date,
            'text': trans_text
        }
        
        current_ver['transactions'].append(transaction)
    
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
            for trans in ver['transactions']:
                account = trans['account']
                amount = trans['amount']
                
                if account not in account_totals:
                    account_totals[account] = 0
                
                account_totals[account] += amount
        
        self.data['account_totals'] = account_totals
        
        # Add account names to transactions for easier reference
        for ver in self.data['verifications']:
            for trans in ver['transactions']:
                account = trans['account']
                if account in self.data['accounts']:
                    trans['account_name'] = self.data['accounts'][account]['name']
                else:
                    trans['account_name'] = "Unknown"
