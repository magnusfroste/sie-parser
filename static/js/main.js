document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const uploadForm = document.getElementById('upload-form');
    const uploadStatus = document.getElementById('upload-status');
    const resultsSection = document.getElementById('results-section');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // JSON data storage
    let processedData = null;
    
    // Event listeners
    uploadForm.addEventListener('submit', handleFileUpload);
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    
    document.getElementById('add-description-btn').addEventListener('click', addDescription);
    document.getElementById('save-json-btn').addEventListener('click', saveJson);
    document.getElementById('copy-json-btn').addEventListener('click', copyJsonToClipboard);
    document.getElementById('transaction-search').addEventListener('input', filterTransactions);
    
    // File upload handler
    function handleFileUpload(e) {
        e.preventDefault();
        
        const fileInput = document.getElementById('sie-file');
        const file = fileInput.files[0];
        
        if (!file) {
            showStatus('Please select a file', 'error');
            return;
        }
        
        // Check file extension
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (fileExt !== 'sie' && fileExt !== 'se') {
            showStatus('Invalid file type. Please select a SIE file (.sie or .se)', 'error');
            return;
        }
        
        showStatus('Processing file...', 'loading');
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                processedData = data.data;
                showStatus('File processed successfully!', 'success');
                displayResults(processedData);
            } else {
                showStatus(data.error || 'An error occurred', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showStatus('Error processing file: ' + error.message, 'error');
        });
    }
    
    // Display status message
    function showStatus(message, type) {
        uploadStatus.textContent = message;
        uploadStatus.className = 'status-message ' + type;
    }
    
    // Switch between tabs
    function switchTab(tabId) {
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            }
        });
        
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            if (pane.id === tabId + '-tab') {
                pane.classList.add('active');
                
                // Special handling for schema tab
                if (tabId === 'schema') {
                    loadSchemaContent();
                }
            }
        });
    }
    
    // Load schema content
    function loadSchemaContent() {
        const schemaTab = document.getElementById('schema-tab');
        
        // Only load content if it hasn't been loaded yet
        if (!schemaTab.querySelector('iframe')) {
            const iframe = document.createElement('iframe');
            iframe.src = '/static/docs/sie_schema.html';
            iframe.style.width = '100%';
            iframe.style.height = '800px';
            iframe.style.border = 'none';
            
            schemaTab.innerHTML = '';
            schemaTab.appendChild(iframe);
        }
    }
    
    // Display results in the UI
    function displayResults(data) {
        resultsSection.style.display = 'block';
        
        // Store the full data in a global variable for later use
        window.sieData = data;
        
        // Populate summary tab
        populateSummary(data.summary);
        
        // Populate balance sheet tab
        populateBalanceSheet(data.ub);
        
        // Populate income statement tab
        populateIncomeStatement(data.income_statement);
        
        // Populate opening balance tab
        populateOpeningBalance(data);
        
        // Populate ledger tab
        populateLedger(data);
        
        // Populate transactions tab
        populateTransactions(data);
        
        // Populate JSON tab
        populateJsonOutput(data);
        
        // Create charts
        createCharts(data);
        
        // Switch to summary tab
        switchTab('summary');
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Populate summary information
    function populateSummary(summary) {
        document.getElementById('company-name').textContent = summary.company_name;
        document.getElementById('period').textContent = summary.period;
        document.getElementById('total-accounts').textContent = summary.total_accounts;
        document.getElementById('total-transactions').textContent = summary.total_transactions.toLocaleString();
        document.getElementById('net-result').textContent = formatCurrency(summary.net_result);
    }
    
    // Populate balance sheet tab
    function populateBalanceSheet(balanceData) {
        // Check if we have balance sheet data
        if (!balanceData || Object.keys(balanceData).length === 0) {
            const balanceTab = document.getElementById('balance-tab');
            if (balanceTab) {
                balanceTab.innerHTML = '<div class="note">No balance sheet data available in this SIE file.</div>';
            }
            return;
        }
        
        // Get references to all the elements we need to update
        const currentAssetsList = document.getElementById('current-assets-list');
        const currentLiabilitiesList = document.getElementById('current-liabilities-list');
        const equityList = document.getElementById('equity-list');
        const balanceYearSelector = document.getElementById('balance-year-selector');
        const balanceYear = document.getElementById('balance-year');
        const balanceAccountCount = document.getElementById('balance-account-count');
        
        // Check if all required elements exist
        if (!currentAssetsList || !currentLiabilitiesList || !equityList || 
            !balanceYearSelector || !balanceYear || !balanceAccountCount) {
            console.error('One or more required elements for balance sheet tab not found');
            return;
        }
        
        // Clear previous content
        currentAssetsList.innerHTML = '';
        currentLiabilitiesList.innerHTML = '';
        equityList.innerHTML = '';
        balanceYearSelector.innerHTML = '';
        
        // Get available years from the data
        const years = Object.keys(balanceData);
        if (years.length === 0) return;
        
        // Populate year selector
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            balanceYearSelector.appendChild(option);
        });
        
        // Set current year
        const currentYear = years[0];
        balanceYear.textContent = `(${currentYear})`;
        
        // Set date labels for opening and closing balances
        if (window.sieData && window.sieData.metadata && window.sieData.metadata.fiscal_years) {
            const fiscalYear = window.sieData.metadata.fiscal_years[currentYear];
            if (fiscalYear) {
                document.getElementById('ob-date-label').textContent = fiscalYear.start_date || '01/01/' + currentYear;
                document.getElementById('cb-date-label').textContent = fiscalYear.end_date || '31/12/' + currentYear;
            }
        }
        
        // Get opening balances for the selected year
        const openingBalances = {};
        if (window.sieData && window.sieData.ib && window.sieData.ib[currentYear]) {
            Object.assign(openingBalances, window.sieData.ib[currentYear]);
        }
        
        // Get closing balances for the selected year
        const closingBalances = balanceData[currentYear] || {};
        
        // Track totals
        let totalAssetsOB = 0;
        let totalAssetsCB = 0;
        let totalLiabilitiesOB = 0;
        let totalLiabilitiesCB = 0;
        let totalEquityOB = 0;
        let totalEquityCB = 0;
        let fixedAssetsOB = 0;
        let fixedAssetsCB = 0;
        let accountCount = 0;
        
        // Process accounts
        const accounts = window.sieData ? window.sieData.accounts : {};
        const processedAccounts = new Set();
        
        // Process all accounts from both opening and closing balances
        const allAccounts = new Set([
            ...Object.keys(openingBalances),
            ...Object.keys(closingBalances)
        ]);
        
        // Create account items for the balance sheet
        allAccounts.forEach(accountNum => {
            if (!accounts[accountNum]) return;
            
            const accountName = accounts[accountNum].name;
            const accountType = accounts[accountNum].type;
            
            // Get opening and closing balances
            const openingBalance = openingBalances[accountNum] || 0;
            const closingBalance = closingBalances[accountNum] || 0;
            const movement = closingBalance - openingBalance;
            
            // Skip accounts with zero opening balance, closing balance, and movement
            if (openingBalance === 0 && closingBalance === 0) {
                return;
            }
            
            // Create account item element
            const accountItem = document.createElement('div');
            accountItem.className = 'account-item';
            accountItem.dataset.account = accountNum;
            
            accountItem.innerHTML = `
                <div class="account-name">${accountNum} - ${accountName}</div>
                <div class="account-ob ${openingBalance >= 0 ? 'positive' : 'negative'}">${formatCurrency(openingBalance, true)}</div>
                <div class="account-movement ${movement >= 0 ? 'positive' : 'negative'}">${formatCurrency(movement, true)}</div>
                <div class="account-cb ${closingBalance >= 0 ? 'positive' : 'negative'}">${formatCurrency(closingBalance, true)}</div>
            `;
            
            // Add to appropriate list based on account type
            if (accountType === 'asset') {
                if (parseInt(accountNum) < 1200) {
                    // Fixed assets
                    fixedAssetsOB += openingBalance;
                    fixedAssetsCB += closingBalance;
                } else {
                    // Current assets
                    currentAssetsList.appendChild(accountItem);
                }
                totalAssetsOB += openingBalance;
                totalAssetsCB += closingBalance;
            } else if (accountType === 'liability') {
                currentLiabilitiesList.appendChild(accountItem);
                totalLiabilitiesOB += openingBalance;
                totalLiabilitiesCB += closingBalance;
            } else if (accountType === 'equity_or_liability') {
                if (parseInt(accountNum) < 2900) {
                    currentLiabilitiesList.appendChild(accountItem);
                    totalLiabilitiesOB += openingBalance;
                    totalLiabilitiesCB += closingBalance;
                } else {
                    equityList.appendChild(accountItem);
                    totalEquityOB += openingBalance;
                    totalEquityCB += closingBalance;
                }
            }
            
            processedAccounts.add(accountNum);
            accountCount++;
        });
        
        // Update fixed assets row
        document.getElementById('fixed-assets-ob').textContent = formatCurrency(fixedAssetsOB, true);
        document.getElementById('fixed-assets-movement').textContent = formatCurrency(fixedAssetsCB - fixedAssetsOB, true);
        document.getElementById('fixed-assets-cb').textContent = formatCurrency(fixedAssetsCB, true);
        
        // Update totals
        document.getElementById('total-assets-ob').textContent = formatCurrency(totalAssetsOB, true);
        document.getElementById('total-assets-movement').textContent = formatCurrency(totalAssetsCB - totalAssetsOB, true);
        document.getElementById('total-assets-cb').textContent = formatCurrency(totalAssetsCB, true);
        
        const totalLiabEquityOB = totalLiabilitiesOB + totalEquityOB;
        const totalLiabEquityCB = totalLiabilitiesCB + totalEquityCB;
        
        document.getElementById('total-liab-equity-ob').textContent = formatCurrency(totalLiabEquityOB, true);
        document.getElementById('total-liab-equity-movement').textContent = formatCurrency(totalLiabEquityCB - totalLiabEquityOB, true);
        document.getElementById('total-liab-equity-cb').textContent = formatCurrency(totalLiabEquityCB, true);
        
        // Update account count
        balanceAccountCount.textContent = accountCount;
        
        // Add event listeners
        balanceYearSelector.addEventListener('change', function() {
            balanceYear.textContent = `(${this.value})`;
            // Re-populate with the selected year
            populateBalanceSheet({ [this.value]: balanceData[this.value] });
        });
        
        document.getElementById('balance-search').addEventListener('input', filterBalanceAccounts);
        document.getElementById('show-decimals').addEventListener('change', toggleDecimals);
    }
    
    // Filter balance sheet accounts based on search input
    function filterBalanceAccounts() {
        const searchTerm = document.getElementById('balance-search').value.toLowerCase();
        const accountItems = document.querySelectorAll('#current-assets-list .account-item, #current-liabilities-list .account-item, #equity-list .account-item');
        let visibleCount = 0;
        
        accountItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                item.style.display = '';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        document.getElementById('balance-account-count').textContent = visibleCount;
    }
    
    // Toggle showing decimals in currency values
    function toggleDecimals() {
        const showDecimals = document.getElementById('show-decimals').checked;
        const amountElements = document.querySelectorAll('.account-ob, .account-movement, .account-cb, .amount-column');
        
        amountElements.forEach(el => {
            // Get the current text and parse it as a number
            const text = el.textContent;
            const match = text.match(/[-\d\s.,]+/);
            if (match) {
                const value = parseFloat(match[0].replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(value)) {
                    el.textContent = formatCurrency(value, showDecimals);
                }
            }
        });
    }
    
    // Populate income statement
    function populateIncomeStatement(incomeData) {
        // Check if we have income statement data
        if (!incomeData || !incomeData.income || !incomeData.expenses) {
            const incomeTab = document.getElementById('income-tab');
            if (incomeTab) {
                incomeTab.innerHTML = '<div class="note">No income statement data available in this SIE file.</div>';
            }
            return;
        }
        
        const incomeList = document.getElementById('income-list');
        const expensesList = document.getElementById('expenses-list');
        const totalIncomeElement = document.getElementById('total-income');
        const totalExpensesElement = document.getElementById('total-expenses');
        const netResultElement = document.getElementById('income-net-result');
        
        // Check if all required elements exist
        if (!incomeList || !expensesList || !totalIncomeElement || 
            !totalExpensesElement || !netResultElement) {
            console.error('One or more required elements for income statement tab not found');
            return;
        }
        
        incomeList.innerHTML = '';
        expensesList.innerHTML = '';
        
        let totalIncome = 0;
        let totalExpenses = 0;
        
        // Populate income accounts
        for (const [accountNum, accountData] of Object.entries(incomeData.income)) {
            // Skip accounts with zero amounts
            if (accountData.amount === 0) {
                continue;
            }
            
            incomeList.appendChild(createAccountItem(accountNum, accountData.name, accountData.amount));
            totalIncome += accountData.amount;
        }
        
        // Populate expense accounts
        for (const [accountNum, accountData] of Object.entries(incomeData.expenses)) {
            // Skip accounts with zero amounts
            if (accountData.amount === 0) {
                continue;
            }
            
            expensesList.appendChild(createAccountItem(accountNum, accountData.name, accountData.amount));
            totalExpenses += accountData.amount;
        }
        
        // Set totals
        totalIncomeElement.textContent = formatCurrency(totalIncome);
        totalExpensesElement.textContent = formatCurrency(totalExpenses);
        netResultElement.textContent = formatCurrency(totalIncome - totalExpenses);
    }
    
    // Create account item element
    function createAccountItem(accountNum, accountName, amount) {
        const item = document.createElement('div');
        item.className = 'account-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'account-name';
        
        const numSpan = document.createElement('span');
        numSpan.className = 'account-number';
        numSpan.textContent = accountNum;
        
        nameSpan.appendChild(numSpan);
        nameSpan.appendChild(document.createTextNode(' ' + accountName));
        
        const amountSpan = document.createElement('span');
        amountSpan.className = 'account-amount';
        amountSpan.textContent = formatCurrency(amount);
        
        item.appendChild(nameSpan);
        item.appendChild(amountSpan);
        
        return item;
    }
    
    // Populate transactions tab
    function populateTransactions(data) {
        // Check if we have transaction data
        if ((!data.all_transactions || data.all_transactions.length === 0) && 
            (!data.transaction_samples || data.transaction_samples.length === 0)) {
            const transactionsTab = document.getElementById('transactions-tab');
            if (transactionsTab) {
                transactionsTab.innerHTML = '<div class="note">No transaction data available in this SIE file.</div>';
            }
            return;
        }
        
        const transactionsTable = document.getElementById('transactions-table');
        const transactionsCount = document.getElementById('transactions-count');
        const searchInput = document.getElementById('search-transactions');
        
        // Check if all required elements exist
        if (!transactionsTable || !transactionsCount || !searchInput) {
            console.error('One or more required elements for transactions tab not found');
            return;
        }
        
        // Clear previous content
        transactionsTable.innerHTML = '';
        
        // Get transactions data
        let transactions = [];
        if (data.all_transactions) {
            // Flatten all transactions from verifications
            data.all_transactions.forEach(ver => {
                ver.transactions.forEach(trans => {
                    // Format verification number
                    let verNumber = '';
                    if (ver.series && ver.number) {
                        verNumber = `${ver.series}${ver.number}`;
                    } else if (ver.number) {
                        verNumber = ver.number;
                    } else if (ver.original_number) {
                        // Use original number if available (for Bokio files)
                        verNumber = ver.original_number;
                    }
                    
                    // Handle transaction text and verification text
                    let transText = trans.text || '';
                    let verText = ver.text || '';
                    
                    // Extract amount from the description if present
                    let amountFromDesc = 0;
                    const amountRegex = /(-?\d+(?:\.\d+)?)/;
                    
                    // Try to extract amount from verification text
                    if (verText) {
                        const verMatch = verText.match(amountRegex);
                        if (verMatch && verMatch[1]) {
                            amountFromDesc = parseFloat(verMatch[1]);
                        }
                    }
                    
                    // Try to extract amount from transaction text if we didn't get it from verification text
                    if (amountFromDesc === 0 && transText) {
                        const transMatch = transText.match(amountRegex);
                        if (transMatch && transMatch[1]) {
                            amountFromDesc = parseFloat(transMatch[1]);
                        }
                    }
                    
                    // Use the amount from the description if the transaction amount is 0
                    let finalAmount = trans.amount;
                    if (finalAmount === 0 && amountFromDesc !== 0) {
                        finalAmount = amountFromDesc;
                    }
                    
                    // Combine texts if both exist, otherwise use whichever exists
                    let combinedText = '';
                    if (transText && verText) {
                        combinedText = `${verText} - ${transText}`;
                    } else {
                        combinedText = transText || verText;
                    }
                    
                    transactions.push({
                        verification: verNumber,
                        date: trans.date || ver.date || '',
                        account: trans.account,
                        account_name: data.accounts[trans.account] ? data.accounts[trans.account].name : 'Unknown',
                        text: combinedText,
                        amount: finalAmount
                    });
                });
            });
        } else if (data.transaction_samples) {
            transactions = data.transaction_samples;
        }
        
        // Sort transactions by date
        transactions.sort((a, b) => {
            return a.date.localeCompare(b.date);
        });
        
        // Create table header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Verification</th>
            <th>Date</th>
            <th>Account</th>
            <th>Description</th>
            <th>Amount</th>
        `;
        transactionsTable.appendChild(headerRow);
        
        // Create table rows for each transaction
        transactions.forEach(trans => {
            // For Bokio files, sometimes the amount is in the verification or date field
            let verification = trans.verification || '';
            let date = trans.date || '';
            let amount = trans.amount || 0;
            let text = trans.text || '';
            
            // If verification looks like a number and amount is 0, it might be the amount
            if (verification && !isNaN(parseFloat(verification)) && amount === 0) {
                amount = parseFloat(verification);
                verification = '';
            }
            
            // If date doesn't look like a date but looks like a number and amount is 0, it might be the amount
            if (date && date.includes('.') && !isNaN(parseFloat(date.replace('-', '.'))) && amount === 0) {
                amount = parseFloat(date.replace('-', '.'));
                date = '';
            }
            
            // If text looks like a number and amount is 0, it might be the amount
            if (text && !isNaN(parseFloat(text)) && amount === 0) {
                amount = parseFloat(text);
                text = '';
            }
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${verification}</td>
                <td>${formatDate(date)}</td>
                <td>${trans.account} (${trans.account_name})</td>
                <td>${text}</td>
                <td class="${amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(amount)}</td>
            `;
            transactionsTable.appendChild(row);
        });
        
        // Update transaction count
        transactionsCount.textContent = transactions.length;
        
        // Add search functionality
        searchInput.addEventListener('input', function() {
            filterTransactions(this.value);
        });
    }
    
    // Filter transactions based on search input
    function filterTransactions() {
        const searchTerm = document.getElementById('transaction-search').value.toLowerCase();
        const rows = document.querySelectorAll('#transactions-table tr');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
        
        document.getElementById('transaction-count').textContent = visibleCount;
    }
    
    // Populate JSON output
    function populateJsonOutput(data) {
        const jsonOutput = document.getElementById('json-output');
        jsonOutput.textContent = JSON.stringify(data, null, 2);
        
        // Set default filename
        const companyName = data.metadata.company_name || 'company';
        const date = new Date().toISOString().split('T')[0];
        document.getElementById('json-filename').value = `${companyName.replace(/\s+/g, '_')}_${date}.json`;
    }
    
    // Add user description to the data
    function addDescription() {
        const description = document.getElementById('llm-description').value.trim();
        
        if (!description) {
            alert('Please enter a description');
            return;
        }
        
        if (!processedData) {
            alert('No data to enhance');
            return;
        }
        
        fetch('/add-description', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: processedData,
                description: description
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                processedData = data.data;
                populateJsonOutput(processedData);
                alert('Description added successfully');
            } else {
                alert(data.error || 'An error occurred');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error adding description: ' + error.message);
        });
    }
    
    // Save JSON to file
    function saveJson() {
        const filename = document.getElementById('json-filename').value.trim();
        
        if (!filename) {
            alert('Please enter a filename');
            return;
        }
        
        if (!processedData) {
            alert('No data to save');
            return;
        }
        
        fetch('/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: processedData,
                filename: filename
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('File saved successfully');
                
                // Create download link
                const downloadLink = document.createElement('a');
                downloadLink.href = `/download/${encodeURIComponent(filename)}`;
                downloadLink.download = filename;
                downloadLink.click();
            } else {
                alert(data.error || 'An error occurred');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error saving file: ' + error.message);
        });
    }
    
    // Copy JSON to clipboard
    function copyJsonToClipboard() {
        const jsonOutput = document.getElementById('json-output');
        
        navigator.clipboard.writeText(jsonOutput.textContent)
            .then(() => {
                alert('JSON copied to clipboard');
            })
            .catch(err => {
                console.error('Error copying to clipboard:', err);
                alert('Failed to copy to clipboard');
            });
    }
    
    // Create charts
    function createCharts(data) {
        createIncomeExpenseChart(data.summary);
        createAccountTypesChart(data.summary.account_types);
    }
    
    // Create income vs expenses chart
    function createIncomeExpenseChart(summary) {
        const ctx = document.getElementById('income-expense-chart').getContext('2d');
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Income', 'Expenses', 'Net Result'],
                datasets: [{
                    label: 'Amount',
                    data: [
                        summary.total_income,
                        summary.total_expenses,
                        summary.net_result
                    ],
                    backgroundColor: [
                        '#2ecc71',
                        '#e74c3c',
                        '#3498db'
                    ]
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    // Create account types chart
    function createAccountTypesChart(accountTypes) {
        const ctx = document.getElementById('account-types-chart').getContext('2d');
        
        const labels = Object.keys(accountTypes);
        const data = Object.values(accountTypes);
        
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#3498db',
                        '#2ecc71',
                        '#e74c3c',
                        '#f39c12',
                        '#9b59b6',
                        '#1abc9c'
                    ]
                }]
            },
            options: {
                responsive: true
            }
        });
    }
    
    // Populate ledger view
    function populateLedger(data) {
        // Check if we have transaction data
        if ((!data.all_transactions || data.all_transactions.length === 0) && 
            (!data.transaction_samples || data.transaction_samples.length === 0)) {
            const ledgerTab = document.getElementById('ledger-tab');
            if (ledgerTab) {
                ledgerTab.innerHTML = '<div class="note">No transaction data available in this SIE file.</div>';
            }
            return;
        }
        
        const ledgerList = document.getElementById('ledger-list');
        const accountCount = document.getElementById('account-count');
        
        // Check if all required elements exist
        if (!ledgerList || !accountCount) {
            console.error('One or more required elements for ledger tab not found');
            return;
        }
        
        ledgerList.innerHTML = '';
        
        // Group transactions by account
        const accountTransactions = {};
        
        // Process all transactions
        if (data.all_transactions) {
            data.all_transactions.forEach(ver => {
                ver.transactions.forEach(trans => {
                    const account = trans.account;
                    
                    if (!accountTransactions[account]) {
                        accountTransactions[account] = [];
                    }
                    
                    // Format verification number
                    let verNumber = '';
                    if (ver.series && ver.number) {
                        verNumber = `${ver.series}${ver.number}`;
                    } else if (ver.number) {
                        verNumber = ver.number;
                    } else if (ver.original_number) {
                        // Use original number if available (for Bokio files)
                        verNumber = ver.original_number;
                    }
                    
                    // Fix for Dooer files where the text field contains the amount
                    let amount = trans.amount;
                    let text = trans.text || '';
                    let verText = ver.text || '';
                    
                    // Extract amount from the description if present
                    let amountFromDesc = 0;
                    const amountRegex = /(-?\d+(?:\.\d+)?)/;
                    
                    // Try to extract amount from verification text
                    if (verText) {
                        const verMatch = verText.match(amountRegex);
                        if (verMatch && verMatch[1]) {
                            amountFromDesc = parseFloat(verMatch[1]);
                        }
                    }
                    
                    // Try to extract amount from transaction text if we didn't get it from verification text
                    if (amountFromDesc === 0 && text) {
                        const transMatch = text.match(amountRegex);
                        if (transMatch && transMatch[1]) {
                            amountFromDesc = parseFloat(transMatch[1]);
                        }
                    }
                    
                    // Use the amount from the description if the transaction amount is 0
                    if (amount === 0 && amountFromDesc !== 0) {
                        amount = amountFromDesc;
                    }
                    
                    // If text looks like a number and amount is 0, use text as amount
                    if (text && !isNaN(parseFloat(text)) && amount === 0) {
                        amount = parseFloat(text);
                        text = '';
                    }
                    
                    // Combine texts if both exist, otherwise use whichever exists
                    let combinedText = '';
                    if (text && verText) {
                        combinedText = `${verText} - ${text}`;
                    } else {
                        combinedText = text || verText;
                    }
                    
                    accountTransactions[account].push({
                        verification: verNumber,
                        date: trans.date || ver.date,
                        amount: amount,
                        text: combinedText,
                        account_name: data.accounts[account] ? data.accounts[account].name : 'Unknown'
                    });
                });
            });
        } else if (data.transaction_samples) {
            // Group sample transactions by account
            data.transaction_samples.forEach(trans => {
                const account = trans.account;
                
                if (!accountTransactions[account]) {
                    accountTransactions[account] = [];
                }
                
                // Fix for Dooer files where the text field contains the amount
                let amount = trans.amount;
                let text = trans.text || '';
                
                // If text looks like a number and amount is 0, use text as amount
                if (text && !isNaN(parseFloat(text)) && amount === 0) {
                    amount = parseFloat(text);
                    text = '';
                }
                
                accountTransactions[account].push({
                    verification: trans.verification,
                    date: trans.date,
                    amount: amount,
                    text: text,
                    account_name: trans.account_name || 'Unknown'
                });
            });
        }
        
        // Sort accounts by number
        const sortedAccounts = Object.keys(accountTransactions).sort((a, b) => {
            return parseInt(a) - parseInt(b);
        });
        
        // Create account sections
        let accountsWithTransactions = 0;
        
        sortedAccounts.forEach(account => {
            const transactions = accountTransactions[account];
            
            // Skip accounts with no transactions or where all transactions have zero amounts
            if (!transactions || transactions.length === 0) {
                return;
            }
            
            // Check if any transaction has a non-zero amount
            const hasNonZeroTransactions = transactions.some(trans => trans.amount !== 0);
            if (!hasNonZeroTransactions) {
                return;
            }
            
            const accountName = transactions[0].account_name;
            
            const accountSection = document.createElement('div');
            accountSection.className = 'account-section';
            accountSection.dataset.account = account;
            
            // Create account header
            const accountHeader = document.createElement('div');
            accountHeader.className = 'account-header';
            accountHeader.innerHTML = `
                <div class="account-title">${account} - ${accountName}</div>
                <div class="account-toggle">▼</div>
            `;
            
            // Create transactions container
            const transactionsContainer = document.createElement('div');
            transactionsContainer.className = 'transactions-container';
            
            // Create transactions table
            const transactionsTable = document.createElement('table');
            transactionsTable.className = 'transactions-table';
            transactionsTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Verification</th>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Balance</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            
            const tbody = transactionsTable.querySelector('tbody');
            
            // Sort transactions by date
            transactions.sort((a, b) => {
                return a.date.localeCompare(b.date);
            });
            
            // Add transactions to table with running balance
            let runningBalance = 0;
            transactions.forEach(trans => {
                runningBalance += trans.amount;
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${trans.verification || ''}</td>
                    <td>${formatDate(trans.date)}</td>
                    <td>${trans.text || ''}</td>
                    <td class="${trans.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(trans.amount)}</td>
                    <td class="${runningBalance >= 0 ? 'positive' : 'negative'}">${formatCurrency(runningBalance)}</td>
                `;
                
                tbody.appendChild(row);
            });
            
            transactionsContainer.appendChild(transactionsTable);
            
            accountSection.appendChild(accountHeader);
            accountSection.appendChild(transactionsContainer);
            
            ledgerList.appendChild(accountSection);
            accountsWithTransactions++;
            
            // Add click event to toggle transactions visibility
            accountHeader.addEventListener('click', function() {
                const transactionsContainer = this.nextElementSibling;
                const toggle = this.querySelector('.account-toggle');
                
                if (transactionsContainer.style.display === 'none') {
                    transactionsContainer.style.display = 'block';
                    toggle.textContent = '▼';
                } else {
                    transactionsContainer.style.display = 'none';
                    toggle.textContent = '▶';
                }
            });
        });
        
        // Update account count
        accountCount.textContent = accountsWithTransactions;
        
        // Add search functionality
        document.getElementById('ledger-search').addEventListener('input', filterLedgerAccounts);
    }
    
    // Filter ledger accounts based on search input
    function filterLedgerAccounts() {
        const searchTerm = document.getElementById('ledger-search').value.toLowerCase();
        const accountSections = document.querySelectorAll('.account-section');
        let visibleCount = 0;
        
        accountSections.forEach(section => {
            const account = section.dataset.account;
            const accountName = section.querySelector('.account-title').textContent.toLowerCase();
            
            if (account.includes(searchTerm) || accountName.includes(searchTerm)) {
                section.style.display = '';
                visibleCount++;
            } else {
                section.style.display = 'none';
            }
        });
        
        document.getElementById('account-count').textContent = visibleCount;
    }
    
    // Populate opening balance tab
    function populateOpeningBalance(data) {
        // Check if we have opening balance data
        if (!data.ib || Object.keys(data.ib).length === 0) {
            const openingTab = document.getElementById('opening-tab');
            if (openingTab) {
                openingTab.innerHTML = '<div class="note">No opening balance data available in this SIE file.</div>';
            }
            return;
        }
        
        const assetsList = document.getElementById('opening-assets-list');
        const liabilitiesList = document.getElementById('opening-liabilities-list');
        const equityList = document.getElementById('opening-equity-list');
        const accountCount = document.getElementById('opening-account-count');
        
        // Check if all required elements exist
        if (!assetsList || !liabilitiesList || !equityList || !accountCount) {
            console.error('One or more required elements for opening balance tab not found');
            return;
        }
        
        assetsList.innerHTML = '';
        liabilitiesList.innerHTML = '';
        equityList.innerHTML = '';
        
        // Get the first year (usually there's only one in SIE4)
        const year = Object.keys(data.ib)[0];
        document.getElementById('opening-year').textContent = `(Year: ${year})`;
        
        if (!year || !data.ib[year]) {
            return;
        }
        
        const ibData = data.ib[year];
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        let accountsCount = 0;
        
        // Process each account in the opening balance
        for (const [accountNum, amount] of Object.entries(ibData)) {
            if (!data.accounts[accountNum]) {
                continue;
            }
            
            // Skip accounts with zero balances
            if (amount === 0) {
                continue;
            }
            
            const accountName = data.accounts[accountNum].name;
            const accountType = data.accounts[accountNum].type;
            
            const accountItem = createAccountItem(accountNum, accountName, amount);
            
            // Add to appropriate section based on account type
            if (accountType === 'asset') {
                assetsList.appendChild(accountItem);
                totalAssets += amount;
            } else if (accountType === 'liability') {
                liabilitiesList.appendChild(accountItem);
                totalLiabilities += amount;
            } else if (accountType === 'equity_or_liability') {
                if (parseInt(accountNum) < 2900) {
                    liabilitiesList.appendChild(accountItem);
                    totalLiabilities += amount;
                } else {
                    equityList.appendChild(accountItem);
                    totalEquity += amount;
                }
            }
            
            accountsCount++;
        }
        
        // Set totals
        document.getElementById('opening-total-assets').textContent = formatCurrency(totalAssets);
        document.getElementById('opening-total-liab-equity').textContent = formatCurrency(totalLiabilities + totalEquity);
        
        // Update account count
        accountCount.textContent = accountsCount;
        
        // Add search functionality
        document.getElementById('opening-search').addEventListener('input', filterOpeningAccounts);
    }
    
    // Filter opening balance accounts based on search input
    function filterOpeningAccounts() {
        const searchTerm = document.getElementById('opening-search').value.toLowerCase();
        const accountItems = document.querySelectorAll('#opening-assets-list .account-item, #opening-liabilities-list .account-item, #opening-equity-list .account-item');
        let visibleCount = 0;
        
        accountItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                item.style.display = '';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        document.getElementById('opening-account-count').textContent = visibleCount;
    }
    
    // Helper function to format currency
    function formatCurrency(amount, showDecimals = false) {
        return new Intl.NumberFormat('sv-SE', {
            style: 'currency',
            currency: 'SEK',
            minimumFractionDigits: showDecimals ? 2 : 0,
            maximumFractionDigits: showDecimals ? 2 : 0
        }).format(amount);
    }
    
    // Helper function to format date (YYYYMMDD to YYYY-MM-DD)
    function formatDate(dateStr) {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }
});
