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
    document.getElementById('income-show-non-zero').addEventListener('change', filterIncomeStatementAccounts);
    document.getElementById('opening-search').addEventListener('input', filterOpeningAccounts);
    document.getElementById('balance-show-non-zero').addEventListener('change', filterBalanceAccounts);
    
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
                return response.json().then(errorData => {
                    throw new Error(errorData.error || 'Server error');
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Get SIE file metadata
                const sieData = data.data;
                const sieVersion = sieData.metadata && sieData.metadata.sie_version ? sieData.metadata.sie_version : 'Unknown';
                const program = sieData.metadata && sieData.metadata.program ? sieData.metadata.program : 'Unknown';
                const year = sieData.metadata && sieData.metadata.financial_year_start ? 
                    sieData.metadata.financial_year_start.substring(0, 4) : 'Unknown';
                
                // Show success message with SIE version and software info
                showStatus(`Successfully parsed ${program} SIE ${sieVersion} file for year ${year}`, 'success');
                
                // Display results
                displayResults(data);
                
                // Switch to summary tab
                switchTab('summary');
                
                // Scroll to results
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                showStatus(data.error || 'An error occurred', 'error');
            }
        })
        .catch(error => {
            showStatus('Error processing file: ' + error.message, 'error');
        });
    }
    
    // Display results in the UI
    function displayResults(data) {
        try {
            // Check if data is valid
            if (!data || typeof data !== 'object') {
                showStatus("Invalid data received from server", "error");
                return;
            }
            
            // Check if data.data exists (from the API response)
            if (data.data && typeof data.data === 'object') {
                data = data.data;
            }
            
            resultsSection.style.display = 'block';
            
            // Store the full data in a global variable for later use
            window.sieData = data;
            processedData = data;
            
            // Ensure data has a summary property
            if (!data.summary) {
                data.summary = {
                    company_name: data.metadata ? data.metadata.company_name || 'Unknown Company' : 'Unknown Company',
                    period: data.metadata ? 
                        `${data.metadata.financial_year_start || ''} - ${data.metadata.financial_year_end || ''}` : 
                        'Unknown Period',
                    total_accounts: Object.keys(data.accounts || {}).length,
                    total_verifications: (data.verifications || []).length,
                    total_transactions: 0,
                    net_result: 0
                };
                
                // Count total transactions
                if (data.verifications) {
                    data.summary.total_transactions = data.verifications.reduce((count, ver) => {
                        return count + (ver.transactions ? ver.transactions.length : 0);
                    }, 0);
                }
                
                // Calculate net result if income statement is available
                if (data.income_statement) {
                    data.summary.net_result = 
                        (data.income_statement.total_income || 0) - 
                        (data.income_statement.total_expenses || 0);
                }
            }
            
            // Ensure all required objects exist to prevent errors
            data.balance_sheet = data.balance_sheet || {};
            data.income_statement = data.income_statement || {};
            data.accounts = data.accounts || {};
            data.verifications = data.verifications || [];
            data.opening_balances = data.opening_balances || {};
            data.closing_balances = data.closing_balances || {};
            
            // Populate tabs with data
            try {
                populateSummary(data.summary);
            } catch (e) {
                console.error("Error populating summary:", e);
            }
            
            try {
                populateBalanceSheet(data);
                console.log("Balance sheet populated successfully");
            } catch (e) {
                console.error("Error populating balance sheet:", e);
            }
            
            try {
                populateIncomeStatement(data);
            } catch (e) {
                console.error("Error populating income statement:", e);
            }
            
            try {
                populateOpeningBalance(data);
            } catch (e) {
                console.error("Error populating opening balance:", e);
            }
            
            try {
                populateLedger(data);
            } catch (e) {
                console.error("Error populating ledger:", e);
            }
            
            try {
                populateTransactions(data);
            } catch (e) {
                console.error("Error populating transactions:", e);
            }
            
            try {
                populateJsonOutput(data);
            } catch (e) {
                console.error("Error populating JSON output:", e);
            }
            
            // Create charts
            try {
                createCharts(data);
            } catch (e) {
                console.error("Error creating charts:", e);
            }
            
        } catch (error) {
            showStatus("Error displaying results: " + error.message, "error");
        }
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
    
    // Populate summary information
    function populateSummary(summary) {
        if (!summary) {
            console.error('No summary data available');
            return;
        }
        
        document.getElementById('company-name').textContent = summary.company_name || 'Unknown';
        document.getElementById('period').textContent = summary.period || '';
        document.getElementById('total-accounts').textContent = summary.total_accounts || 0;
        document.getElementById('total-transactions').textContent = (summary.total_transactions || 0).toLocaleString();
        
        // Calculate net result if not provided
        let netResult = summary.net_result;
        if (netResult === undefined && window.sieData && window.sieData.income_statement) {
            const incomeStatement = window.sieData.income_statement;
            netResult = (incomeStatement.total_income || 0) - (incomeStatement.total_expenses || 0);
        }
        
        document.getElementById('net-result').textContent = formatCurrency(netResult || 0);
    }
    
    // Populate balance sheet tab
    function populateBalanceSheet(data) {
        // Get references to DOM elements
        const balanceSheetTab = document.getElementById('balance-sheet-tab');
        
        if (!balanceSheetTab) {
            console.error('Balance sheet tab element not found');
            return;
        }
        
        // Clear previous content
        balanceSheetTab.innerHTML = '';
        
        // Extract data
        const accounts = data.accounts || {};
        const openingBalances = data.opening_balances || {};
        const closingBalances = data.closing_balances || {};
        
        // Get the financial year
        const year = data.metadata && data.metadata.financial_year_start ? 
            data.metadata.financial_year_start.substring(0, 4) : new Date().getFullYear().toString();
            
        // For opening balances, use the first available year key (same as Opening Balance tab)
        const openingBalanceYear = Object.keys(openingBalances)[0] || year;
        
        console.log("Processing balance sheet for year:", year);
        console.log("Opening balance year:", openingBalanceYear);
        console.log("All opening balance years:", Object.keys(openingBalances));
        
        // Log all accounts in the opening balances
        if (openingBalances[openingBalanceYear]) {
            console.log("All accounts in opening balances:", Object.keys(openingBalances[openingBalanceYear]));
            console.log("Total accounts in opening balances:", Object.keys(openingBalances[openingBalanceYear]).length);
        }
        
        // Check all opening balance years
        Object.keys(openingBalances).forEach(yearKey => {
            console.log(`Opening balances for year ${yearKey}:`, Object.keys(openingBalances[yearKey]).length, "accounts");
        });
        
        // Create filter checkbox
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        
        const filterCheckbox = document.createElement('input');
        filterCheckbox.type = 'checkbox';
        filterCheckbox.id = 'balance-show-non-zero';
        filterCheckbox.checked = true;
        
        const filterLabel = document.createElement('label');
        filterLabel.htmlFor = 'balance-show-non-zero';
        filterLabel.textContent = 'Show only accounts with values';
        
        filterContainer.appendChild(filterCheckbox);
        filterContainer.appendChild(filterLabel);
        balanceSheetTab.appendChild(filterContainer);
        
        // Create balance sheet table
        const table = document.createElement('table');
        table.className = 'balance-sheet-table';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Account</th>
                <th>Name</th>
                <th>Opening Balance</th>
                <th>Movement</th>
                <th>Closing Balance</th>
            </tr>
        `;
        
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Process accounts by type
        const accountsByType = {
            'Asset': [],
            'Liability': [],
            'Equity': []
        };
        
        // Group accounts by type
        Object.entries(accounts).forEach(([accountNum, accountData]) => {
            const type = accountData.type || 'Other';
            if (type in accountsByType) {
                accountsByType[type].push({
                    number: accountNum,
                    data: accountData
                });
            }
        });
        
        // Also add accounts from opening balances that might not be in the accounts list
        // Only use the first available year's opening balances
        if (openingBalances[openingBalanceYear]) {
            Object.keys(openingBalances[openingBalanceYear]).forEach(accountNum => {
                // Check if this account is already in our lists
                let found = false;
                for (const type in accountsByType) {
                    if (accountsByType[type].some(acc => acc.number === accountNum)) {
                        found = true;
                        break;
                    }
                }
                
                // If not found, add it to the appropriate type
                if (!found) {
                    // Try to determine account type from account number
                    let type = 'Other';
                    const accNum = parseInt(accountNum);
                    
                    if (accNum >= 1000 && accNum < 2000) {
                        type = 'Asset';
                    } else if (accNum >= 2000 && accNum < 3000) {
                        type = 'Equity';
                    } else if (accNum >= 3000 && accNum < 4000) {
                        type = 'Liability';
                    }
                    
                    if (type in accountsByType) {
                        // Get account name from accounts if available, otherwise use "Account X"
                        const accountName = accounts[accountNum] ? accounts[accountNum].name : `Account ${accountNum}`;
                        
                        accountsByType[type].push({
                            number: accountNum,
                            data: { name: accountName, type: type }
                        });
                    }
                }
            });
        }
        
        // Create a map to store account transactions
        const accountTransactionsMap = new Map();
        
        // Initialize account transactions map
        Object.keys(accounts).forEach(accountNum => {
            accountTransactionsMap.set(accountNum, {
                name: accounts[accountNum].name || '',
                transactions: []
            });
        });
        
        // Collect transactions for each account
        if (data.verifications) {
            data.verifications.forEach(verification => {
                if (!verification.transactions) return;
                
                verification.transactions.forEach(transaction => {
                    const accountNumber = transaction.account;
                    
                    if (!accountTransactionsMap.has(accountNumber)) {
                        accountTransactionsMap.set(accountNumber, {
                            name: transaction.account_name || '',
                            transactions: []
                        });
                    }
                    
                    accountTransactionsMap.get(accountNumber).transactions.push({
                        verification: verification.id,
                        date: verification.date,
                        text: verification.text,
                        amount: transaction.amount,
                        account: accountNumber,
                        account_name: transaction.account_name
                    });
                });
            });
        }
        
        // Process each account type
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        
        // Add Assets section
        const assetHeader = document.createElement('tr');
        assetHeader.className = 'section-header';
        assetHeader.innerHTML = `<td colspan="5">Assets</td>`;
        tbody.appendChild(assetHeader);
        
        // Sort accounts by number
        accountsByType['Asset'].sort((a, b) => parseInt(a.number) - parseInt(b.number));
        
        // Process each asset account
        accountsByType['Asset'].forEach(({ number, data }) => {
            // Get opening balance
            let openingBalance = 0;
            if (openingBalanceYear && openingBalances[openingBalanceYear] && openingBalances[openingBalanceYear][number]) {
                const obEntry = openingBalances[openingBalanceYear][number];
                openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
            }
            
            // Calculate movement by summing all transactions
            let movement = 0;
            if (accountTransactionsMap.has(number)) {
                const transactions = accountTransactionsMap.get(number).transactions;
                movement = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            }
            
            // Calculate closing balance
            const closingBalance = openingBalance + movement;
            
            // Skip accounts with zero values if filter is checked
            if (document.getElementById('balance-show-non-zero').checked && 
                openingBalance === 0 && movement === 0 && closingBalance === 0) {
                return;
            }
            
            // Create row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${number}</td>
                <td>${data.name || ''}</td>
                <td>${formatCurrency(openingBalance)}</td>
                <td>${formatCurrency(movement)}</td>
                <td>${formatCurrency(closingBalance)}</td>
            `;
            
            tbody.appendChild(row);
            totalAssets += closingBalance;
        });
        
        // Add total assets row
        const totalAssetsRow = document.createElement('tr');
        totalAssetsRow.className = 'total-row';
        
        // Calculate total opening balances for assets
        let totalOpeningAssets = 0;
        let totalMovementAssets = 0;
        
        accountsByType['Asset'].forEach(({ number }) => {
            // Get opening balance
            if (openingBalanceYear && openingBalances[openingBalanceYear] && openingBalances[openingBalanceYear][number]) {
                const obEntry = openingBalances[openingBalanceYear][number];
                const openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
                totalOpeningAssets += openingBalance;
            }
            
            // Calculate movement
            if (accountTransactionsMap.has(number)) {
                const transactions = accountTransactionsMap.get(number).transactions;
                const movement = transactions.reduce((sum, tx) => sum + tx.amount, 0);
                totalMovementAssets += movement;
            }
        });
        
        totalAssetsRow.innerHTML = `
            <td colspan="2">Total Assets</td>
            <td>${formatCurrency(totalOpeningAssets)}</td>
            <td>${formatCurrency(totalMovementAssets)}</td>
            <td>${formatCurrency(totalAssets)}</td>
        `;
        tbody.appendChild(totalAssetsRow);
        
        // Add Liabilities section
        const liabilitiesHeader = document.createElement('tr');
        liabilitiesHeader.className = 'section-header';
        liabilitiesHeader.innerHTML = `<td colspan="5">Liabilities</td>`;
        tbody.appendChild(liabilitiesHeader);
        
        // Sort accounts by number
        accountsByType['Liability'].sort((a, b) => parseInt(a.number) - parseInt(b.number));
        
        // Process each liability account
        accountsByType['Liability'].forEach(({ number, data }) => {
            // Get opening balance
            let openingBalance = 0;
            if (openingBalanceYear && openingBalances[openingBalanceYear] && openingBalances[openingBalanceYear][number]) {
                const obEntry = openingBalances[openingBalanceYear][number];
                openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
            }
            
            // Calculate movement by summing all transactions
            let movement = 0;
            if (accountTransactionsMap.has(number)) {
                const transactions = accountTransactionsMap.get(number).transactions;
                movement = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            }
            
            // Calculate closing balance
            const closingBalance = openingBalance + movement;
            
            // Skip accounts with zero values if filter is checked
            if (document.getElementById('balance-show-non-zero').checked && 
                openingBalance === 0 && movement === 0 && closingBalance === 0) {
                return;
            }
            
            // Create row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${number}</td>
                <td>${data.name || ''}</td>
                <td>${formatCurrency(openingBalance)}</td>
                <td>${formatCurrency(movement)}</td>
                <td>${formatCurrency(closingBalance)}</td>
            `;
            
            tbody.appendChild(row);
            totalLiabilities += closingBalance;
        });
        
        // Add total liabilities row
        const totalLiabilitiesRow = document.createElement('tr');
        totalLiabilitiesRow.className = 'total-row';
        
        // Calculate total opening balances for liabilities
        let totalOpeningLiabilities = 0;
        let totalMovementLiabilities = 0;
        
        accountsByType['Liability'].forEach(({ number }) => {
            // Get opening balance
            if (openingBalanceYear && openingBalances[openingBalanceYear] && openingBalances[openingBalanceYear][number]) {
                const obEntry = openingBalances[openingBalanceYear][number];
                const openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
                totalOpeningLiabilities += openingBalance;
            }
            
            // Calculate movement
            if (accountTransactionsMap.has(number)) {
                const transactions = accountTransactionsMap.get(number).transactions;
                const movement = transactions.reduce((sum, tx) => sum + tx.amount, 0);
                totalMovementLiabilities += movement;
            }
        });
        
        totalLiabilitiesRow.innerHTML = `
            <td colspan="2">Total Liabilities</td>
            <td>${formatCurrency(totalOpeningLiabilities)}</td>
            <td>${formatCurrency(totalMovementLiabilities)}</td>
            <td>${formatCurrency(totalLiabilities)}</td>
        `;
        tbody.appendChild(totalLiabilitiesRow);
        
        // Add Equity section
        const equityHeader = document.createElement('tr');
        equityHeader.className = 'section-header';
        equityHeader.innerHTML = `<td colspan="5">Equity</td>`;
        tbody.appendChild(equityHeader);
        
        // Sort accounts by number
        accountsByType['Equity'].sort((a, b) => parseInt(a.number) - parseInt(b.number));
        
        // Process each equity account
        accountsByType['Equity'].forEach(({ number, data }) => {
            // Get opening balance
            let openingBalance = 0;
            if (openingBalanceYear && openingBalances[openingBalanceYear] && openingBalances[openingBalanceYear][number]) {
                const obEntry = openingBalances[openingBalanceYear][number];
                openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
            }
            
            // Calculate movement by summing all transactions
            let movement = 0;
            if (accountTransactionsMap.has(number)) {
                const transactions = accountTransactionsMap.get(number).transactions;
                movement = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            }
            
            // Calculate closing balance
            const closingBalance = openingBalance + movement;
            
            // Skip accounts with zero values if filter is checked
            if (document.getElementById('balance-show-non-zero').checked && 
                openingBalance === 0 && movement === 0 && closingBalance === 0) {
                return;
            }
            
            // Create row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${number}</td>
                <td>${data.name || ''}</td>
                <td>${formatCurrency(openingBalance)}</td>
                <td>${formatCurrency(movement)}</td>
                <td>${formatCurrency(closingBalance)}</td>
            `;
            
            tbody.appendChild(row);
            totalEquity += closingBalance;
        });
        
        // Add total equity row
        const totalEquityRow = document.createElement('tr');
        totalEquityRow.className = 'total-row';
        
        // Calculate total opening balances for equity
        let totalOpeningEquity = 0;
        let totalMovementEquity = 0;
        
        accountsByType['Equity'].forEach(({ number }) => {
            // Get opening balance
            if (openingBalanceYear && openingBalances[openingBalanceYear] && openingBalances[openingBalanceYear][number]) {
                const obEntry = openingBalances[openingBalanceYear][number];
                const openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
                totalOpeningEquity += openingBalance;
            }
            
            // Calculate movement
            if (accountTransactionsMap.has(number)) {
                const transactions = accountTransactionsMap.get(number).transactions;
                const movement = transactions.reduce((sum, tx) => sum + tx.amount, 0);
                totalMovementEquity += movement;
            }
        });
        
        totalEquityRow.innerHTML = `
            <td colspan="2">Total Equity</td>
            <td>${formatCurrency(totalOpeningEquity)}</td>
            <td>${formatCurrency(totalMovementEquity)}</td>
            <td>${formatCurrency(totalEquity)}</td>
        `;
        tbody.appendChild(totalEquityRow);
        
        // Add total liabilities and equity row
        const totalLiabilitiesEquityRow = document.createElement('tr');
        totalLiabilitiesEquityRow.className = 'total-row grand-total';
        
        // Calculate combined totals
        const totalOpeningLiabilitiesEquity = totalOpeningLiabilities + totalOpeningEquity;
        const totalMovementLiabilitiesEquity = totalMovementLiabilities + totalMovementEquity;
        const totalClosingLiabilitiesEquity = totalLiabilities + totalEquity;
        
        totalLiabilitiesEquityRow.innerHTML = `
            <td colspan="2">Total Liabilities & Equity</td>
            <td>${formatCurrency(totalOpeningLiabilitiesEquity)}</td>
            <td>${formatCurrency(totalMovementLiabilitiesEquity)}</td>
            <td>${formatCurrency(totalClosingLiabilitiesEquity)}</td>
        `;
        tbody.appendChild(totalLiabilitiesEquityRow);
        
        // Add closing balance summary row
        const closingBalanceSummaryRow = document.createElement('tr');
        closingBalanceSummaryRow.className = 'closing-balance-row';
        closingBalanceSummaryRow.innerHTML = `
            <td colspan="3" class="closing-balance-label">Closing Balance (${year}-12-31)</td>
            <td></td>
            <td class="closing-balance-value">${formatCurrency(totalClosingLiabilitiesEquity)}</td>
        `;
        tbody.appendChild(closingBalanceSummaryRow);
        
        table.appendChild(tbody);
        balanceSheetTab.appendChild(table);
        
        // Add event listener to filter checkbox
        filterCheckbox.addEventListener('change', filterBalanceAccounts);
    }
    
    // Filter balance sheet accounts based on checkbox
    function filterBalanceAccounts() {
        const showNonZero = document.getElementById('balance-show-non-zero').checked;
        const table = document.querySelector('.balance-sheet-table');
        
        if (!table) return;
        
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            // Skip section headers and total rows
            if (row.classList.contains('section-header') || row.classList.contains('total-row')) {
                return;
            }
            
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5) {
                const openingBalance = parseFloat(cells[2].textContent.replace(/[^\d.-]/g, '')) || 0;
                const movement = parseFloat(cells[3].textContent.replace(/[^\d.-]/g, '')) || 0;
                const closingBalance = parseFloat(cells[4].textContent.replace(/[^\d.-]/g, '')) || 0;
                
                if (showNonZero && openingBalance === 0 && movement === 0 && closingBalance === 0) {
                    row.style.display = 'none';
                } else {
                    row.style.display = '';
                }
            }
        });
    }
    
    // Populate income statement tab
    function populateIncomeStatement(data) {
        // Get references to DOM elements
        const incomeStatementTab = document.getElementById('income-tab');
        const incomeList = document.getElementById('income-list');
        const expensesList = document.getElementById('expenses-list');
        const totalIncomeSpan = document.getElementById('total-income');
        const totalExpensesSpan = document.getElementById('total-expenses');
        const netResultSpan = document.getElementById('income-net-result');
        
        if (!incomeStatementTab || !incomeList || !expensesList) {
            console.error('Income statement elements not found');
            return;
        }
        
        // Clear previous content
        incomeList.innerHTML = '';
        expensesList.innerHTML = '';
        
        // Extract data
        const incomeStatement = data.income_statement || {};
        const accounts = data.accounts || {};
        
        // Collect all income accounts from both income statement and accounts
        const incomeAccounts = new Set();
        const expenseAccounts = new Set();
        
        // Add accounts from income statement
        if (incomeStatement.income) {
            Object.keys(incomeStatement.income).forEach(accNum => incomeAccounts.add(accNum));
        }
        
        if (incomeStatement.expenses) {
            Object.keys(incomeStatement.expenses).forEach(accNum => expenseAccounts.add(accNum));
        }
        
        // Add all accounts of type Income and Expense from the accounts object
        for (const accNum in accounts) {
            const account = accounts[accNum];
            if (account.type === "Income") {
                incomeAccounts.add(accNum);
            } else if (account.type === "Expense") {
                expenseAccounts.add(accNum);
            }
        }
        
        // Process income accounts
        let totalIncome = 0;
        
        // Sort account numbers
        const sortedIncomeAccounts = Array.from(incomeAccounts).sort((a, b) => parseInt(a) - parseInt(b));
        
        for (const accountNum of sortedIncomeAccounts) {
            // Get account data
            const accountData = incomeStatement.income && incomeStatement.income[accountNum] ? 
                incomeStatement.income[accountNum] : 
                { name: accounts[accountNum] ? accounts[accountNum].name : 'Unknown', amount: 0 };
            
            // Get the amount
            let amount = accountData.amount || 0;
            
            // For display purposes only, show revenue as positive
            const displayAmount = Math.abs(amount);
            
            // Skip accounts with zero values if filter is active
            if (document.getElementById('income-show-non-zero')?.checked && displayAmount === 0) {
                continue;
            }
            
            // Update total (using the original amount for calculations)
            totalIncome += amount;
            
            // Create account row
            const accountRow = document.createElement('div');
            accountRow.className = 'account-row';
            accountRow.dataset.accountNum = accountNum;
            accountRow.dataset.amount = amount;
            
            // Add zero-value class if amount is zero
            if (amount === 0) {
                accountRow.classList.add('zero-value');
            }
            
            accountRow.innerHTML = `
                <div class="account-info">
                    <span class="account-number">${accountNum}</span>
                    <span class="account-name">${accountData.name || 'Unknown'}</span>
                </div>
                <span class="account-amount positive">${formatCurrency(displayAmount)}</span>
            `;
            
            incomeList.appendChild(accountRow);
        }
        
        // Process expense accounts
        let totalExpenses = 0;
        
        // Sort account numbers
        const sortedExpenseAccounts = Array.from(expenseAccounts).sort((a, b) => parseInt(a) - parseInt(b));
        
        for (const accountNum of sortedExpenseAccounts) {
            // Get account data
            const accountData = incomeStatement.expenses && incomeStatement.expenses[accountNum] ? 
                incomeStatement.expenses[accountNum] : 
                { name: accounts[accountNum] ? accounts[accountNum].name : 'Unknown', amount: 0 };
            
            // Get the amount
            const amount = accountData.amount || 0;
            
            // Skip accounts with zero values if filter is active
            if (document.getElementById('income-show-non-zero')?.checked && amount === 0) {
                continue;
            }
            
            // Update total
            totalExpenses += amount;
            
            // Create account row
            const accountRow = document.createElement('div');
            accountRow.className = 'account-row';
            accountRow.dataset.accountNum = accountNum;
            accountRow.dataset.amount = amount;
            
            // Add zero-value class if amount is zero
            if (amount === 0) {
                accountRow.classList.add('zero-value');
            }
            
            accountRow.innerHTML = `
                <div class="account-info">
                    <span class="account-number">${accountNum}</span>
                    <span class="account-name">${accountData.name || 'Unknown'}</span>
                </div>
                <span class="account-amount ${amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(amount)}</span>
            `;
            
            expensesList.appendChild(accountRow);
        }
        
        // Update totals and net result
        const displayTotalIncome = Math.abs(incomeStatement.total_income || totalIncome);
        const displayTotalExpenses = incomeStatement.total_expenses || totalExpenses;
        const netIncome = displayTotalIncome - displayTotalExpenses;
        
        totalIncomeSpan.textContent = formatCurrency(displayTotalIncome);
        totalIncomeSpan.className = 'positive';
        
        totalExpensesSpan.textContent = formatCurrency(displayTotalExpenses);
        totalExpensesSpan.className = displayTotalExpenses >= 0 ? 'positive' : 'negative';
        
        netResultSpan.textContent = formatCurrency(netIncome);
        netResultSpan.className = netIncome >= 0 ? 'positive' : 'negative';
    }
    
    // Filter income statement accounts based on checkbox
    function filterIncomeStatementAccounts() {
        const showNonZeroCheckbox = document.getElementById('income-show-non-zero');
        const accountRows = document.querySelectorAll('#income-list .account-row, #expenses-list .account-row');
        
        if (!showNonZeroCheckbox || !accountRows.length) {
            return;
        }
        
        const showOnlyNonZero = showNonZeroCheckbox.checked;
        
        accountRows.forEach(row => {
            const amount = parseFloat(row.dataset.amount) || 0;
            
            if (showOnlyNonZero && amount === 0) {
                row.style.display = 'none';
            } else {
                row.style.display = '';
            }
        });
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
        if (!data.verifications || data.verifications.length === 0) {
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
        
        // Get transactions data directly from the standardized data model
        let transactions = [];
        
        // Process verifications from the standardized data model
        data.verifications.forEach(ver => {
            if (ver.transactions && ver.transactions.length > 0) {
                ver.transactions.forEach(trans => {
                    // Format verification number using standardized fields
                    let verNumber = '';
                    if (ver.series && ver.number) {
                        verNumber = `${ver.series}${ver.number}`;
                    } else if (ver.number) {
                        verNumber = ver.number;
                    }
                    
                    // Get account name from the standardized data model
                    let accountName = trans.account_name || "Unknown";
                    if (!accountName || accountName === "Unknown") {
                        if (data.accounts && data.accounts[trans.account]) {
                            accountName = data.accounts[trans.account].name || "Unknown";
                        }
                    }
                    
                    // Use the standardized transaction fields directly
                    transactions.push({
                        verification: verNumber,
                        date: trans.date || ver.date || '',
                        account: trans.account,
                        account_name: accountName,
                        text: trans.text || ver.text || '',
                        amount: trans.amount || 0
                    });
                });
            }
        });
        
        // Update transaction count
        transactionsCount.textContent = transactions.length;
        
        // Create table header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Ver. No.</th>
            <th>Date</th>
            <th>Account</th>
            <th>Description</th>
            <th>Amount</th>
        `;
        transactionsTable.appendChild(headerRow);
        
        // Add transactions to table
        transactions.forEach(trans => {
            const row = document.createElement('tr');
            
            // Format date (YYYYMMDD to YYYY-MM-DD)
            const formattedDate = formatDate(trans.date);
            
            row.innerHTML = `
                <td>${trans.verification}</td>
                <td>${formattedDate}</td>
                <td>${trans.account} (${trans.account_name})</td>
                <td>${trans.text}</td>
                <td class="${trans.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(trans.amount)}</td>
            `;
            
            transactionsTable.appendChild(row);
        });
        
        // Add search functionality
        searchInput.addEventListener('input', filterTransactions);
        
        // Store transactions for filtering
        window.allTransactions = transactions;
    }
    
    // Filter transactions based on search input
    function filterTransactions() {
        const searchTerm = document.getElementById('search-transactions').value.toLowerCase();
        const transactionsTable = document.getElementById('transactions-table');
        const transactionsCount = document.getElementById('transactions-count');
        
        if (!window.allTransactions || !transactionsTable || !transactionsCount) {
            console.error('Missing required elements for filtering transactions');
            return;
        }
        
        // Clear the table except for the header
        while (transactionsTable.rows.length > 1) {
            transactionsTable.deleteRow(1);
        }
        
        // Filter transactions based on search term
        const filteredTransactions = window.allTransactions.filter(trans => {
            return (
                (trans.verification && trans.verification.toLowerCase().includes(searchTerm)) ||
                (trans.date && trans.date.toLowerCase().includes(searchTerm)) ||
                (trans.account && trans.account.toLowerCase().includes(searchTerm)) ||
                (trans.account_name && trans.account_name.toLowerCase().includes(searchTerm)) ||
                (trans.text && trans.text.toLowerCase().includes(searchTerm)) ||
                (trans.amount && trans.amount.toString().includes(searchTerm))
            );
        });
        
        // Add filtered transactions to table
        filteredTransactions.forEach(trans => {
            const row = document.createElement('tr');
            
            // Format date (YYYYMMDD to YYYY-MM-DD)
            const formattedDate = formatDate(trans.date);
            
            row.innerHTML = `
                <td>${trans.verification}</td>
                <td>${formattedDate}</td>
                <td>${trans.account} (${trans.account_name})</td>
                <td>${trans.text}</td>
                <td class="${trans.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(trans.amount)}</td>
            `;
            
            transactionsTable.appendChild(row);
        });
        
        // Update transaction count
        transactionsCount.textContent = filteredTransactions.length;
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
        // Get references to DOM elements
        const ledgerTab = document.getElementById('ledger-tab');
        
        if (!ledgerTab) {
            console.error('Ledger tab element not found');
            return;
        }
        
        // Clear previous content
        ledgerTab.innerHTML = '';
        
        // Create ledger container and list
        const ledgerContainer = document.createElement('div');
        ledgerContainer.className = 'ledger-container';
        
        const ledgerList = document.createElement('div');
        ledgerList.id = 'ledger-list';
        ledgerList.className = 'ledger-list';
        
        ledgerContainer.appendChild(ledgerList);
        ledgerTab.appendChild(ledgerContainer);
        
        // Add account count display
        const accountCountDisplay = document.createElement('div');
        accountCountDisplay.className = 'ledger-info';
        accountCountDisplay.innerHTML = '<span id="account-count">0</span> accounts shown';
        ledgerTab.insertBefore(accountCountDisplay, ledgerContainer);
        
        // Add search box
        const searchBox = document.createElement('div');
        searchBox.className = 'ledger-controls';
        searchBox.innerHTML = `
            <div class="search-box">
                <input type="text" id="ledger-search" placeholder="Search accounts...">
            </div>
        `;
        ledgerTab.insertBefore(searchBox, accountCountDisplay);
        
        // Make sure we're working with the correct data structure
        // The data might be nested inside a data property
        const sieData = data.data || data;
        
        // Basic validation
        if (!sieData || !sieData.accounts || Object.keys(sieData.accounts).length === 0) {
            ledgerList.innerHTML = '<div class="note">No account data available in this SIE file.</div>';
            return;
        }
        
        // Create a map to group transactions by account
        const accountTransactionsMap = new Map();
        
        // Get opening balances
        const openingBalances = data.opening_balances || {};
        // Determine the year (financial year)
        const year = Object.keys(openingBalances)[0] || '';
        
        // Initialize all accounts first
        for (const accountNum in sieData.accounts) {
            const account = sieData.accounts[accountNum];
            accountTransactionsMap.set(accountNum, {
                name: account.name || "Unknown",
                transactions: []
            });
        }
        
        // Process all verifications and their transactions
        if (sieData.verifications && Array.isArray(sieData.verifications)) {
            sieData.verifications.forEach((verification) => {
                // Skip if no transactions
                if (!verification.transactions || !Array.isArray(verification.transactions)) {
                    return;
                }
                
                // Format verification number
                const verNumber = verification.series && verification.number 
                    ? `${verification.series}${verification.number}` 
                    : verification.number || '';
                
                // Process each transaction in this verification
                verification.transactions.forEach((transaction) => {
                    // Skip if no account number
                    if (!transaction.account) {
                        return;
                    }
                    
                    const accountNumber = transaction.account;
                    
                    // Get account name
                    let accountName = transaction.account_name || "Unknown";
                    if (!accountName || accountName === "Unknown") {
                        if (sieData.accounts && sieData.accounts[accountNumber]) {
                            accountName = sieData.accounts[accountNumber].name || "Unknown";
                        }
                    }
                    
                    // Create entry for this account if it doesn't exist
                    if (!accountTransactionsMap.has(accountNumber)) {
                        accountTransactionsMap.set(accountNumber, {
                            name: accountName,
                            transactions: []
                        });
                    }
                    
                    // Add transaction to this account
                    accountTransactionsMap.get(accountNumber).transactions.push({
                        verification: verNumber,
                        date: transaction.date || verification.date || '',
                        text: transaction.text || verification.text || '',
                        amount: parseFloat(transaction.amount) || 0,
                        account: accountNumber,
                        account_name: accountName
                    });
                });
            });
        }
        
        // Sort accounts by number
        const sortedAccounts = Array.from(accountTransactionsMap.keys()).sort((a, b) => {
            return parseInt(a) - parseInt(b);
        });
        
        // Create account sections
        let accountsWithTransactions = 0;
        
        sortedAccounts.forEach(accountNumber => {
            const accountData = accountTransactionsMap.get(accountNumber);
            const transactions = accountData.transactions;
            
            // Skip accounts with no transactions
            if (transactions.length === 0) {
                return;
            }
            
            // Create account section
            const accountSection = document.createElement('div');
            accountSection.className = 'account-section';
            accountSection.dataset.account = accountNumber;
            
            // Create account header
            const accountHeader = document.createElement('div');
            accountHeader.className = 'account-header';
            accountHeader.innerHTML = `
                <div class="account-title">${accountNumber} - ${accountData.name}</div>
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
            
            // Add opening balance row if available
            let runningBalance = 0;
            if (year && openingBalances[year] && openingBalances[year][accountNumber]) {
                const obEntry = openingBalances[year][accountNumber];
                const openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
                runningBalance = openingBalance;
                
                const openingRow = document.createElement('tr');
                openingRow.className = 'opening-balance-row';
                openingRow.innerHTML = `
                    <td>-</td>
                    <td>${year}-01-01</td>
                    <td>Opening Balance</td>
                    <td></td>
                    <td>${formatCurrency(openingBalance)}</td>
                `;
                
                tbody.appendChild(openingRow);
            }
            
            // Add transactions to table with running balance
            transactions.forEach(transaction => {
                runningBalance += transaction.amount;
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${transaction.verification}</td>
                    <td>${formatDate(transaction.date)}</td>
                    <td>${transaction.text}</td>
                    <td>${formatCurrency(transaction.amount)}</td>
                    <td>${formatCurrency(runningBalance)}</td>
                `;
                
                tbody.appendChild(row);
            });
            
            // Add closing balance summary row
            const closingBalanceRow = document.createElement('tr');
            closingBalanceRow.className = 'closing-balance-row';
            closingBalanceRow.innerHTML = `
                <td colspan="3" class="closing-balance-label">Closing Balance (${year}-12-31)</td>
                <td></td>
                <td class="closing-balance-value">${formatCurrency(runningBalance)}</td>
            `;
            
            tbody.appendChild(closingBalanceRow);
            
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
        const accountCount = document.getElementById('account-count');
        if (accountCount) {
            accountCount.textContent = accountsWithTransactions;
        }
        
        // If no accounts with transactions were found
        if (accountsWithTransactions === 0) {
            ledgerList.innerHTML = '<div class="note">No transactions found for any account.</div>';
        }
        
        // Add search functionality
        const ledgerSearch = document.getElementById('ledger-search');
        if (ledgerSearch) {
            ledgerSearch.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
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
                
                if (accountCount) {
                    accountCount.textContent = visibleCount;
                }
            });
        }
    }
    
    // Populate opening balance tab
    function populateOpeningBalance(data) {
        const openingTab = document.getElementById('opening-tab');
        
        if (!openingTab) {
            console.error('Opening balance tab element not found');
            return;
        }
        
        // Clear previous content
        openingTab.innerHTML = '';
        
        // Check if we have opening balance data
        // The data can come from opening_balances property in the data model
        const openingBalances = data.opening_balances || {};
        const closingBalances = data.closing_balances || {};
        
        if (Object.keys(openingBalances).length === 0) {
            openingTab.innerHTML = '<div class="note">No opening balance data available in this SIE file.</div>';
            return;
        }
        
        // Create opening balance table
        const table = document.createElement('table');
        table.className = 'data-table';
        
        // Create header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Account</th>
            <th>Name</th>
            <th>Amount</th>
        `;
        table.appendChild(headerRow);
        
        // Get the first year (usually there's only one in SIE4)
        const year = Object.keys(openingBalances)[0];
        
        if (!year || !openingBalances[year]) {
            openingTab.innerHTML = '<div class="note">No opening balance data available for any year.</div>';
            return;
        }
        
        // Add year information
        const yearInfo = document.createElement('div');
        yearInfo.className = 'year-info';
        yearInfo.textContent = `Opening Balances for Year: ${year}`;
        openingTab.appendChild(yearInfo);
        
        // Process accounts by type
        const accounts = data.accounts || {};
        const yearBalances = openingBalances[year];
        
        // Create sections for different account types
        const sections = {
            'Asset': { header: 'Assets', items: [], total: 0 },
            'Liability/Equity': { header: 'Liabilities & Equity', items: [], total: 0 }
        };
        
        // Process each account in the opening balance
        for (const accountNum in yearBalances) {
            const balanceEntry = yearBalances[accountNum];
            const amount = typeof balanceEntry === 'object' ? balanceEntry.amount : parseFloat(balanceEntry) || 0;
            
            // Skip accounts with zero balances
            if (amount === 0) {
                continue;
            }
            
            // Get account information
            const account = accounts[accountNum] || { name: 'Unknown', type: '' };
            const accountName = account.name || 'Unknown';
            const accountType = account.type || '';
            
            // Determine section based on account type
            let section;
            if (accountType === 'Asset') {
                section = sections['Asset'];
            } else {
                section = sections['Liability/Equity'];
            }
            
            // Add to section
            section.items.push({ accountNum, accountName, amount });
            section.total += parseFloat(amount) || 0;
        }
        
        // Add sections to table
        for (const sectionKey in sections) {
            const section = sections[sectionKey];
            
            // Skip empty sections
            if (section.items.length === 0) {
                continue;
            }
            
            // Add section header
            const sectionHeaderRow = document.createElement('tr');
            sectionHeaderRow.className = 'section-header';
            sectionHeaderRow.innerHTML = `<td colspan="3">${section.header}</td>`;
            table.appendChild(sectionHeaderRow);
            
            // Add section items
            section.items.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.accountNum}</td>
                    <td>${item.accountName}</td>
                    <td>${formatCurrency(item.amount)}</td>
                `;
                table.appendChild(row);
            });
            
            // Add section total
            const sectionTotalRow = document.createElement('tr');
            sectionTotalRow.className = 'total-row';
            sectionTotalRow.innerHTML = `
                <td colspan="2">Total ${section.header}</td>
                <td>${formatCurrency(section.total)}</td>
            `;
            table.appendChild(sectionTotalRow);
        }
        
        // Add table to tab
        openingTab.appendChild(table);
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
