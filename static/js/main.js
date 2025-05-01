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
                
                // Special handling for LLM export tab
                if (tabId === 'llm-export') {
                    initLLMExportTab();
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
    
    // Initialize the LLM Export tab
    function initLLMExportTab() {
        if (!processedData) return;
        
        // Set company info
        document.getElementById('llm-company-name').textContent = 
            processedData.metadata.company_name || 'Company Name';
        
        const periodSpan = document.querySelector('#llm-period span');
        periodSpan.textContent = 
            `${processedData.metadata.financial_year_start || ''} - ${processedData.metadata.financial_year_end || ''}`;
        
        // Add event listeners if not already added
        if (!document.getElementById('generate-llm-export').hasAttribute('listener')) {
            document.getElementById('generate-llm-export').addEventListener('click', generateLLMExport);
            document.getElementById('generate-llm-export').setAttribute('listener', 'true');
            
            document.getElementById('download-llm-export').addEventListener('click', downloadLLMExport);
            document.getElementById('copy-llm-export').addEventListener('click', copyLLMExportToClipboard);
            
            // Add listeners for radio buttons to update preview when changed
            document.querySelectorAll('input[name="detail-level"]').forEach(radio => {
                radio.addEventListener('change', updateLLMPreview);
            });
            
            // Add listeners for checkboxes to update preview when changed
            document.getElementById('include-previous-years').addEventListener('change', updateLLMPreview);
            document.getElementById('include-summary').addEventListener('change', updateLLMPreview);
            document.getElementById('include-income').addEventListener('change', updateLLMPreview);
            document.getElementById('include-balance').addEventListener('change', updateLLMPreview);
            document.getElementById('include-key-ratios').addEventListener('change', updateLLMPreview);
        }
        
        // Generate initial preview
        updateLLMPreview();
    }
    
    // Update the LLM preview based on selected options
    function updateLLMPreview() {
        const detailLevel = document.querySelector('input[name="detail-level"]:checked').value;
        const includePreviousYears = document.getElementById('include-previous-years').checked;
        const includeSummary = document.getElementById('include-summary').checked;
        const includeIncome = document.getElementById('include-income').checked;
        const includeBalance = document.getElementById('include-balance').checked;
        const includeKeyRatios = document.getElementById('include-key-ratios').checked;
        
        // Generate preview data
        const previewData = generateLLMData(detailLevel, includePreviousYears, includeSummary, includeIncome, includeBalance, includeKeyRatios);
        
        // Display preview
        const previewElement = document.getElementById('llm-preview');
        
        // Format the preview data as JSON with indentation for readability
        const formattedPreview = JSON.stringify(previewData, null, 2);
        
        // Update the preview
        previewElement.innerHTML = `<pre>${formattedPreview}</pre>`;
        
        // Enhanced debugging
        console.log("Detail Level:", detailLevel);
        console.log("Preview Data:", previewData);
        console.log("Original Data Structure:", JSON.stringify(processedData, null, 2));
        
        // Specifically log income statement and balance sheet data
        console.log("Income Statement Data:", processedData.income_statement);
        console.log("Balance Sheet Data:", processedData.balance_sheet);
        
        // Estimate token count (rough approximation: 1 token ≈ 4 characters for English text)
        const tokenEstimate = Math.ceil(formattedPreview.length / 4);
        document.getElementById('token-estimate').textContent = tokenEstimate.toLocaleString();
        
        // Show export actions
        document.querySelector('.llm-export-actions').style.display = 'flex';
    }
    
    // Generate LLM-optimized data structure based on selected options
    function generateLLMData(detailLevel, includePreviousYears, includeSummary, includeIncome, includeBalance, includeKeyRatios) {
        if (!processedData) return {};
        
        // Log the entire processed data for debugging
        console.log("Full processed data:", JSON.stringify(processedData, null, 2));
        
        const result = {
            company_info: {
                name: processedData.metadata.company_name || 'Unknown',
                organization_number: processedData.metadata.organization_number || 'Unknown',
                fiscal_year: processedData.metadata.financial_year_start 
                    ? `${processedData.metadata.financial_year_start} - ${processedData.metadata.financial_year_end}`
                    : 'Unknown'
            },
            generated_at: new Date().toISOString(),
            detail_level: detailLevel,
            currency: processedData.metadata.currency || 'SEK'
        };
        
        // Add company summary if selected
        if (includeSummary) {
            result.summary = {
                total_accounts: Object.keys(processedData.accounts || {}).length,
                total_transactions: processedData.summary?.total_transactions || 0,
                net_result: parseFloat(processedData.income_statement?.net_result) || 0
            };
        }
        
        // Add income statement if selected
        if (includeIncome) {
            result.income_statement = generateSimpleIncomeStatement(detailLevel);
        }
        
        // Add balance sheet if selected
        if (includeBalance) {
            result.balance_sheet = generateSimpleBalanceSheet(detailLevel);
        }
        
        // Add key financial ratios if selected
        if (includeKeyRatios) {
            result.key_ratios = calculateFinancialRatios();
        }
        
        return result;
    }
    
    // Generate a simple income statement based on detail level
    function generateSimpleIncomeStatement(detailLevel) {
        if (!processedData) {
            console.log("Processed data not available");
            return { error: "Processed data not available" };
        }
        
        console.log("Full processed data for income statement:", processedData);
        
        // Try to get income statement from different possible locations in the data structure
        let incomeStatementData = processedData.income_statement;
        
        // Debug what we found
        console.log("Income statement data found:", incomeStatementData);
        
        const currentYear = processedData.metadata?.financial_year_end 
            ? processedData.metadata.financial_year_end.substring(0, 4) 
            : new Date().getFullYear().toString();
        
        const incomeData = {
            period: currentYear,
            currency: processedData.metadata?.currency || 'SEK',
            data: {}
        };
        
        // If we don't have income statement data, try to build it from accounts directly
        if (!incomeStatementData || Object.keys(incomeStatementData).length === 0) {
            console.log("Building income statement from accounts");
            
            let totalRevenue = 0;
            let totalExpenses = 0;
            
            // Look through all accounts to find income and expense accounts
            if (processedData.accounts) {
                Object.entries(processedData.accounts).forEach(([accNum, account]) => {
                    // Income accounts typically start with 3
                    if (accNum.startsWith('3') && account.balance) {
                        totalRevenue += parseFloat(account.balance) || 0;
                    }
                    // Expense accounts typically start with 4-8
                    else if ((accNum.startsWith('4') || accNum.startsWith('5') || 
                             accNum.startsWith('6') || accNum.startsWith('7') || 
                             accNum.startsWith('8')) && account.balance) {
                        totalExpenses += parseFloat(account.balance) || 0;
                    }
                });
            }
            
            // Create a basic income statement structure
            incomeStatementData = {
                total_income: totalRevenue,
                total_expenses: totalExpenses,
                net_income: totalRevenue - totalExpenses
            };
        }
        
        // Now build the data structure based on detail level
        if (detailLevel === 'high') {
            // High level - only major categories
            incomeData.data = {
                revenue: {
                    total_revenue: parseFloat(incomeStatementData.total_income || 0)
                },
                expenses: {
                    total_expenses: parseFloat(incomeStatementData.total_expenses || 0)
                },
                net_result: parseFloat(incomeStatementData.net_income || 0)
            };
        } else if (detailLevel === 'medium') {
            // Medium level - categories
            const incomeCategories = {};
            const expenseCategories = {};
            
            // Try to extract categories from the data
            if (processedData.accounts) {
                // Group accounts by first digit for categories
                Object.entries(processedData.accounts).forEach(([accNum, account]) => {
                    if (accNum.startsWith('3') && account.balance) {
                        const category = `Income - ${accNum.substring(0, 2)}xx`;
                        incomeCategories[category] = (incomeCategories[category] || 0) + parseFloat(account.balance);
                    }
                    else if ((accNum.startsWith('4') || accNum.startsWith('5') || 
                             accNum.startsWith('6') || accNum.startsWith('7') || 
                             accNum.startsWith('8')) && account.balance) {
                        const category = `Expense - ${accNum.substring(0, 2)}xx`;
                        expenseCategories[category] = (expenseCategories[category] || 0) + parseFloat(account.balance);
                    }
                });
            }
            
            incomeData.data = {
                revenue: {
                    categories: incomeCategories,
                    total_revenue: parseFloat(incomeStatementData.total_income || 0)
                },
                expenses: {
                    categories: expenseCategories,
                    total_expenses: parseFloat(incomeStatementData.total_expenses || 0)
                },
                net_result: parseFloat(incomeStatementData.net_income || 0)
            };
        } else {
            // Detailed level - all accounts
            const incomeAccounts = {};
            const expenseAccounts = {};
            
            // Extract all accounts
            if (processedData.accounts) {
                Object.entries(processedData.accounts).forEach(([accNum, account]) => {
                    if (accNum.startsWith('3') && account.balance) {
                        incomeAccounts[`${accNum} - ${account.name || 'Unknown'}`] = parseFloat(account.balance);
                    }
                    else if ((accNum.startsWith('4') || accNum.startsWith('5') || 
                             accNum.startsWith('6') || accNum.startsWith('7') || 
                             accNum.startsWith('8')) && account.balance) {
                        expenseAccounts[`${accNum} - ${account.name || 'Unknown'}`] = parseFloat(account.balance);
                    }
                });
            }
            
            incomeData.data = {
                revenue: {
                    accounts: incomeAccounts,
                    total_revenue: parseFloat(incomeStatementData.total_income || 0)
                },
                expenses: {
                    accounts: expenseAccounts,
                    total_expenses: parseFloat(incomeStatementData.total_expenses || 0)
                },
                net_result: parseFloat(incomeStatementData.net_income || 0)
            };
        }
        
        return incomeData;
    }
    
    // Generate a simple balance sheet based on detail level
    function generateSimpleBalanceSheet(detailLevel) {
        if (!processedData) {
            console.log("Processed data not available");
            return { error: "Processed data not available" };
        }
        
        console.log("Full processed data for balance sheet:", processedData);
        
        // Try to get balance sheet from different possible locations in the data structure
        let balanceSheetData = processedData.balance_sheet;
        
        // Debug what we found
        console.log("Balance sheet data found:", balanceSheetData);
        
        const balanceData = {
            as_of_date: processedData.metadata?.financial_year_end || 'Unknown',
            currency: processedData.metadata?.currency || 'SEK',
            data: {}
        };
        
        // If we don't have balance sheet data, try to build it from accounts directly
        if (!balanceSheetData || Object.keys(balanceSheetData).length === 0) {
            console.log("Building balance sheet from accounts");
            
            let totalAssets = 0;
            let totalLiabilities = 0;
            let totalEquity = 0;
            
            // Look through all accounts to find asset, liability, and equity accounts
            if (processedData.accounts) {
                Object.entries(processedData.accounts).forEach(([accNum, account]) => {
                    // Asset accounts typically start with 1
                    if (accNum.startsWith('1') && account.balance) {
                        totalAssets += parseFloat(account.balance) || 0;
                    }
                    // Equity accounts typically start with 20-21
                    else if ((accNum.startsWith('20') || accNum.startsWith('21')) && account.balance) {
                        totalEquity += parseFloat(account.balance) || 0;
                    }
                    // Liability accounts typically start with 2 (except 20-21)
                    else if (accNum.startsWith('2') && account.balance) {
                        totalLiabilities += parseFloat(account.balance) || 0;
                    }
                });
            }
            
            // Create a basic balance sheet structure
            balanceSheetData = {
                total_assets: totalAssets,
                total_liabilities: totalLiabilities,
                total_equity: totalEquity
            };
        }
        
        // Now build the data structure based on detail level
        if (detailLevel === 'high') {
            // High level - only major categories
            balanceData.data = {
                assets: {
                    total_assets: parseFloat(balanceSheetData.total_assets || 0)
                },
                liabilities: {
                    total_liabilities: parseFloat(balanceSheetData.total_liabilities || 0)
                },
                equity: {
                    total_equity: parseFloat(balanceSheetData.total_equity || 0)
                }
            };
        } else if (detailLevel === 'medium') {
            // Medium level - categories
            const assetCategories = {};
            const liabilityCategories = {};
            const equityCategories = {};
            
            // Try to extract categories from the data
            if (processedData.accounts) {
                // Group accounts by first digit for categories
                Object.entries(processedData.accounts).forEach(([accNum, account]) => {
                    if (accNum.startsWith('1') && account.balance) {
                        const category = `Asset - ${accNum.substring(0, 2)}xx`;
                        assetCategories[category] = (assetCategories[category] || 0) + parseFloat(account.balance);
                    }
                    else if ((accNum.startsWith('20') || accNum.startsWith('21')) && account.balance) {
                        const category = `Equity - ${accNum.substring(0, 2)}xx`;
                        equityCategories[category] = (equityCategories[category] || 0) + parseFloat(account.balance);
                    }
                    else if (accNum.startsWith('2') && account.balance) {
                        const category = `Liability - ${accNum.substring(0, 2)}xx`;
                        liabilityCategories[category] = (liabilityCategories[category] || 0) + parseFloat(account.balance);
                    }
                });
            }
            
            balanceData.data = {
                assets: {
                    categories: assetCategories,
                    total_assets: parseFloat(balanceSheetData.total_assets || 0)
                },
                liabilities: {
                    categories: liabilityCategories,
                    total_liabilities: parseFloat(balanceSheetData.total_liabilities || 0)
                },
                equity: {
                    categories: equityCategories,
                    total_equity: parseFloat(balanceSheetData.total_equity || 0)
                }
            };
        } else {
            // Detailed level - all accounts
            const assetAccounts = {};
            const liabilityAccounts = {};
            const equityAccounts = {};
            
            // Extract all accounts
            if (processedData.accounts) {
                Object.entries(processedData.accounts).forEach(([accNum, account]) => {
                    if (accNum.startsWith('1') && account.balance) {
                        assetAccounts[`${accNum} - ${account.name || 'Unknown'}`] = parseFloat(account.balance);
                    }
                    else if ((accNum.startsWith('20') || accNum.startsWith('21')) && account.balance) {
                        equityAccounts[`${accNum} - ${account.name || 'Unknown'}`] = parseFloat(account.balance);
                    }
                    else if (accNum.startsWith('2') && account.balance) {
                        liabilityAccounts[`${accNum} - ${account.name || 'Unknown'}`] = parseFloat(account.balance);
                    }
                });
            }
            
            balanceData.data = {
                assets: {
                    accounts: assetAccounts,
                    total_assets: parseFloat(balanceSheetData.total_assets || 0)
                },
                liabilities: {
                    accounts: liabilityAccounts,
                    total_liabilities: parseFloat(balanceSheetData.total_liabilities || 0)
                },
                equity: {
                    accounts: equityAccounts,
                    total_equity: parseFloat(balanceSheetData.total_equity || 0)
                }
            };
        }
        
        return balanceData;
    }
    
    // Calculate key financial ratios
    function calculateFinancialRatios() {
        if (!processedData) return {};
        
        const balanceSheet = processedData.balance_sheet || {};
        const incomeStatement = processedData.income_statement || {};
        
        const totalAssets = parseFloat(balanceSheet.total_assets) || 0;
        const totalLiabilities = parseFloat(balanceSheet.total_liabilities) || 0;
        const totalEquity = parseFloat(balanceSheet.total_equity) || 0;
        const totalRevenue = parseFloat(incomeStatement.total_income) || 0;
        const netIncome = parseFloat(incomeStatement.net_result) || 0;
        
        // Calculate ratios
        const ratios = {
            // Liquidity ratios
            current_ratio: 0,
            quick_ratio: 0,
            
            // Solvency ratios
            debt_to_equity: totalEquity !== 0 ? (totalLiabilities / totalEquity) : 0,
            equity_ratio: totalAssets !== 0 ? (totalEquity / totalAssets) : 0,
            debt_ratio: totalAssets !== 0 ? (totalLiabilities / totalAssets) : 0,
            
            // Profitability ratios
            return_on_assets: totalAssets !== 0 ? (netIncome / totalAssets) : 0,
            return_on_equity: totalEquity !== 0 ? (netIncome / totalEquity) : 0,
            profit_margin: totalRevenue !== 0 ? (netIncome / totalRevenue) : 0,
            
            // Efficiency ratios
            asset_turnover: totalAssets !== 0 ? (totalRevenue / totalAssets) : 0
        };
        
        // Try to calculate current ratio and quick ratio if we have current assets and liabilities
        if (balanceSheet.assets && balanceSheet.liabilities) {
            let currentAssets = 0;
            let currentLiabilities = 0;
            let quickAssets = 0; // Cash + Short-term investments + Accounts receivable
            
            // Extract current assets
            if (balanceSheet.assets.current_assets) {
                currentAssets = Array.isArray(balanceSheet.assets.current_assets) 
                    ? balanceSheet.assets.current_assets.reduce((sum, acc) => sum + (parseFloat(acc.closing_balance) || 0), 0)
                    : 0;
                
                // Extract quick assets (cash, receivables)
                const cashAccounts = balanceSheet.assets.current_assets.filter(acc => 
                    acc.number.startsWith('19') || // Cash and bank accounts
                    acc.number.startsWith('15') || // Short-term receivables
                    acc.number.startsWith('16') || // Short-term receivables
                    acc.number.startsWith('17')    // Short-term receivables
                );
                
                quickAssets = cashAccounts.reduce((sum, acc) => sum + (parseFloat(acc.closing_balance) || 0), 0);
            }
            
            // Extract current liabilities
            if (balanceSheet.liabilities.current_liabilities) {
                currentLiabilities = Array.isArray(balanceSheet.liabilities.current_liabilities)
                    ? balanceSheet.liabilities.current_liabilities.reduce((sum, acc) => sum + (parseFloat(acc.closing_balance) || 0), 0)
                    : 0;
            }
            
            // Calculate liquidity ratios
            if (currentLiabilities !== 0) {
                ratios.current_ratio = currentAssets / currentLiabilities;
                ratios.quick_ratio = quickAssets / currentLiabilities;
            }
        }
        
        return ratios;
    }
    
    // Generate the full LLM export
    function generateLLMExport() {
        const detailLevel = document.querySelector('input[name="detail-level"]:checked').value;
        const includePreviousYears = document.getElementById('include-previous-years').checked;
        const includeSummary = document.getElementById('include-summary').checked;
        const includeIncome = document.getElementById('include-income').checked;
        const includeBalance = document.getElementById('include-balance').checked;
        const includeKeyRatios = document.getElementById('include-key-ratios').checked;
        
        // Generate the complete data
        window.llmExportData = generateLLMData(
            detailLevel, 
            includePreviousYears, 
            includeSummary, 
            includeIncome, 
            includeBalance, 
            includeKeyRatios
        );
        
        // Update the preview
        updateLLMPreview();
    }
    
    // Download the LLM export as JSON
    function downloadLLMExport() {
        if (!window.llmExportData) {
            generateLLMExport();
        }
        
        const jsonString = JSON.stringify(window.llmExportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const companyName = processedData.metadata.company_name || 'company';
        const sanitizedName = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const detailLevel = document.querySelector('input[name="detail-level"]:checked').value;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizedName}_financial_data_${detailLevel}_level.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Copy the LLM export to clipboard
    function copyLLMExportToClipboard() {
        if (!window.llmExportData) {
            generateLLMExport();
        }
        
        const jsonString = JSON.stringify(window.llmExportData, null, 2);
        
        navigator.clipboard.writeText(jsonString)
            .then(() => {
                const copyButton = document.getElementById('copy-llm-export');
                const originalText = copyButton.textContent;
                
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy to clipboard');
            });
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
        const balanceSheetTab = document.getElementById('balance-tab');
        const bsTable = document.querySelector('.bs-report-table tbody');
        const totalAssetsSpan = document.getElementById('total-assets');
        const totalLiabilitiesSpan = document.getElementById('total-liabilities');
        const totalEquitySpan = document.getElementById('total-equity');
        const totalLiabilitiesEquitySpan = document.getElementById('total-liabilities-equity');
        const assetsPlaceholder = document.getElementById('assets-placeholder');
        const liabilitiesPlaceholder = document.getElementById('liabilities-placeholder');
        const equityPlaceholder = document.getElementById('equity-placeholder');
        
        // Get total spans for OB and Movement
        const totalAssetsOBSpan = document.getElementById('total-assets-ob');
        const totalAssetsMovementSpan = document.getElementById('total-assets-movement');
        const totalLiabilitiesOBSpan = document.getElementById('total-liabilities-ob');
        const totalLiabilitiesMovementSpan = document.getElementById('total-liabilities-movement');
        const totalEquityOBSpan = document.getElementById('total-equity-ob');
        const totalEquityMovementSpan = document.getElementById('total-equity-movement');
        const totalLiabilitiesEquityOBSpan = document.getElementById('total-liabilities-equity-ob');
        const totalLiabilitiesEquityMovementSpan = document.getElementById('total-liabilities-equity-movement');
        
        // Get company info elements
        const bsCompanyName = document.getElementById('bs-company-name');
        const bsPeriod = document.getElementById('bs-period').querySelector('span');
        
        if (!balanceSheetTab || !bsTable) {
            console.error('Balance sheet elements not found');
            return;
        }
        
        // Set company name and period
        const companyName = data.metadata?.company_name || 'Company Name';
        const endDate = data.metadata?.financial_year_end || '';
        const periodText = endDate ? endDate : 'Current Period';
        
        bsCompanyName.textContent = companyName;
        bsPeriod.textContent = periodText;
        
        // Extract data
        const accounts = data.accounts || {};
        const openingBalances = data.opening_balances || {};
        const closingBalances = data.closing_balances || {};
        
        // Get the financial year
        const year = data.metadata && data.metadata.financial_year_start ? 
            data.metadata.financial_year_start.substring(0, 4) : new Date().getFullYear().toString();
            
        // For opening balances, use the first available year key (same as Opening Balance tab)
        const openingBalanceYear = Object.keys(openingBalances)[0] || year;
        
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
        let totalOpeningAssets = 0;
        let totalMovementAssets = 0;
        let totalOpeningLiabilities = 0;
        let totalMovementLiabilities = 0;
        let totalOpeningEquity = 0;
        let totalMovementEquity = 0;
        
        // Process Assets
        let assetsRowsHTML = '';
        
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
            
            // Skip accounts with zero values if filter is active
            if (document.getElementById('balance-show-non-zero')?.checked && 
                openingBalance === 0 && movement === 0 && closingBalance === 0) {
                return;
            }
            
            // Create row HTML
            assetsRowsHTML += `
                <tr class="account-row" data-account-num="${number}" data-amount="${closingBalance}">
                    <td class="account-col">${number}</td>
                    <td class="name-col">${data.name || ''}</td>
                    <td class="amount-col">${formatCurrency(openingBalance)}</td>
                    <td class="amount-col">${formatCurrency(movement)}</td>
                    <td class="amount-col">${formatCurrency(closingBalance)}</td>
                </tr>
            `;
            
            totalAssets += closingBalance;
            totalOpeningAssets += openingBalance;
            totalMovementAssets += movement;
        });
        
        // Insert asset rows
        if (assetsRowsHTML) {
            // Remove placeholder if we have rows
            if (assetsPlaceholder) {
                assetsPlaceholder.remove();
            }
            
            // Find the assets section header
            const assetsSectionHeader = Array.from(bsTable.querySelectorAll('.section-header')).find(
                header => header.textContent.trim() === 'Assets'
            );
            
            if (assetsSectionHeader) {
                // Insert after the header
                assetsSectionHeader.insertAdjacentHTML('afterend', assetsRowsHTML);
            }
        }
        
        // Update total assets
        if (totalAssetsSpan) {
            totalAssetsSpan.textContent = formatCurrency(totalAssets);
            totalAssetsSpan.className = 'amount-col ' + (totalAssets >= 0 ? 'positive' : 'negative');
        }
        
        if (totalAssetsOBSpan) {
            totalAssetsOBSpan.textContent = formatCurrency(totalOpeningAssets);
            totalAssetsOBSpan.className = 'amount-col ' + (totalOpeningAssets >= 0 ? 'positive' : 'negative');
        }
        
        if (totalAssetsMovementSpan) {
            totalAssetsMovementSpan.textContent = formatCurrency(totalMovementAssets);
            totalAssetsMovementSpan.className = 'amount-col ' + (totalMovementAssets >= 0 ? 'positive' : 'negative');
        }
        
        // Process Liabilities
        let liabilitiesRowsHTML = '';
        
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
            
            // Skip accounts with zero values if filter is active
            if (document.getElementById('balance-show-non-zero')?.checked && 
                openingBalance === 0 && movement === 0 && closingBalance === 0) {
                return;
            }
            
            // Create row HTML
            liabilitiesRowsHTML += `
                <tr class="account-row" data-account-num="${number}" data-amount="${closingBalance}">
                    <td class="account-col">${number}</td>
                    <td class="name-col">${data.name || ''}</td>
                    <td class="amount-col">${formatCurrency(openingBalance)}</td>
                    <td class="amount-col">${formatCurrency(movement)}</td>
                    <td class="amount-col">${formatCurrency(closingBalance)}</td>
                </tr>
            `;
            
            totalLiabilities += closingBalance;
            totalOpeningLiabilities += openingBalance;
            totalMovementLiabilities += movement;
        });
        
        // Insert liability rows
        if (liabilitiesRowsHTML) {
            // Remove placeholder if we have rows
            if (liabilitiesPlaceholder) {
                liabilitiesPlaceholder.remove();
            }
            
            // Find the liabilities section header
            const liabilitiesSectionHeader = Array.from(bsTable.querySelectorAll('.section-header')).find(
                header => header.textContent.trim() === 'Liabilities'
            );
            
            if (liabilitiesSectionHeader) {
                // Insert after the header
                liabilitiesSectionHeader.insertAdjacentHTML('afterend', liabilitiesRowsHTML);
            }
        }
        
        // Update total liabilities
        if (totalLiabilitiesSpan) {
            totalLiabilitiesSpan.textContent = formatCurrency(totalLiabilities);
            totalLiabilitiesSpan.className = 'amount-col ' + (totalLiabilities >= 0 ? 'positive' : 'negative');
        }
        
        if (totalLiabilitiesOBSpan) {
            totalLiabilitiesOBSpan.textContent = formatCurrency(totalOpeningLiabilities);
            totalLiabilitiesOBSpan.className = 'amount-col ' + (totalOpeningLiabilities >= 0 ? 'positive' : 'negative');
        }
        
        if (totalLiabilitiesMovementSpan) {
            totalLiabilitiesMovementSpan.textContent = formatCurrency(totalMovementLiabilities);
            totalLiabilitiesMovementSpan.className = 'amount-col ' + (totalMovementLiabilities >= 0 ? 'positive' : 'negative');
        }
        
        // Process Equity
        let equityRowsHTML = '';
        
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
            
            // Skip accounts with zero values if filter is active
            if (document.getElementById('balance-show-non-zero')?.checked && 
                openingBalance === 0 && movement === 0 && closingBalance === 0) {
                return;
            }
            
            // Create row HTML
            equityRowsHTML += `
                <tr class="account-row" data-account-num="${number}" data-amount="${closingBalance}">
                    <td class="account-col">${number}</td>
                    <td class="name-col">${data.name || ''}</td>
                    <td class="amount-col">${formatCurrency(openingBalance)}</td>
                    <td class="amount-col">${formatCurrency(movement)}</td>
                    <td class="amount-col">${formatCurrency(closingBalance)}</td>
                </tr>
            `;
            
            totalEquity += closingBalance;
            totalOpeningEquity += openingBalance;
            totalMovementEquity += movement;
        });
        
        // Insert equity rows
        if (equityRowsHTML) {
            // Remove placeholder if we have rows
            if (equityPlaceholder) {
                equityPlaceholder.remove();
            }
            
            // Find the equity section header
            const equitySectionHeader = Array.from(bsTable.querySelectorAll('.section-header')).find(
                header => header.textContent.trim() === 'Equity'
            );
            
            if (equitySectionHeader) {
                // Insert after the header
                equitySectionHeader.insertAdjacentHTML('afterend', equityRowsHTML);
            }
        }
        
        // Update total equity
        if (totalEquitySpan) {
            totalEquitySpan.textContent = formatCurrency(totalEquity);
            totalEquitySpan.className = 'amount-col ' + (totalEquity >= 0 ? 'positive' : 'negative');
        }
        
        if (totalEquityOBSpan) {
            totalEquityOBSpan.textContent = formatCurrency(totalOpeningEquity);
            totalEquityOBSpan.className = 'amount-col ' + (totalOpeningEquity >= 0 ? 'positive' : 'negative');
        }
        
        if (totalEquityMovementSpan) {
            totalEquityMovementSpan.textContent = formatCurrency(totalMovementEquity);
            totalEquityMovementSpan.className = 'amount-col ' + (totalMovementEquity >= 0 ? 'positive' : 'negative');
        }
        
        // Update total liabilities & equity
        const totalLiabilitiesEquity = totalLiabilities + totalEquity;
        const totalOpeningLiabilitiesEquity = totalOpeningLiabilities + totalOpeningEquity;
        const totalMovementLiabilitiesEquity = totalMovementLiabilities + totalMovementEquity;
        
        if (totalLiabilitiesEquitySpan) {
            totalLiabilitiesEquitySpan.textContent = formatCurrency(totalLiabilitiesEquity);
            totalLiabilitiesEquitySpan.className = 'amount-col ' + (totalLiabilitiesEquity >= 0 ? 'positive' : 'negative');
        }
        
        if (totalLiabilitiesEquityOBSpan) {
            totalLiabilitiesEquityOBSpan.textContent = formatCurrency(totalOpeningLiabilitiesEquity);
            totalLiabilitiesEquityOBSpan.className = 'amount-col ' + (totalOpeningLiabilitiesEquity >= 0 ? 'positive' : 'negative');
        }
        
        if (totalLiabilitiesEquityMovementSpan) {
            totalLiabilitiesEquityMovementSpan.textContent = formatCurrency(totalMovementLiabilitiesEquity);
            totalLiabilitiesEquityMovementSpan.className = 'amount-col ' + (totalMovementLiabilitiesEquity >= 0 ? 'positive' : 'negative');
        }
        
        // Add event listeners for the action buttons
        document.getElementById('print-bs')?.addEventListener('click', () => {
            window.print();
        });
        
        document.getElementById('export-bs-pdf')?.addEventListener('click', () => {
            alert('PDF export functionality would be implemented here.');
            // In a real implementation, this would use a library like jsPDF to generate a PDF
        });
        
        // Update the filter event listener
        document.getElementById('balance-show-non-zero')?.addEventListener('change', filterBalanceAccounts);
    }
    
    // Filter balance sheet accounts based on checkbox
    function filterBalanceAccounts() {
        const showNonZeroCheckbox = document.getElementById('balance-show-non-zero');
        const accountRows = document.querySelectorAll('.bs-report-table .account-row');
        
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
    
    // Populate income statement tab
    function populateIncomeStatement(data) {
        // Get references to DOM elements
        const incomeStatementTab = document.getElementById('income-tab');
        const plTable = document.querySelector('.pl-report-table tbody');
        const totalIncomeSpan = document.getElementById('total-income');
        const totalExpensesSpan = document.getElementById('total-expenses');
        const netResultSpan = document.getElementById('income-net-result');
        const incomePlaceholder = document.getElementById('income-placeholder');
        const expensesPlaceholder = document.getElementById('expenses-placeholder');
        
        // Get company info elements
        const plCompanyName = document.getElementById('pl-company-name');
        const plPeriod = document.getElementById('pl-period').querySelector('span');
        
        if (!incomeStatementTab || !plTable) {
            console.error('Income statement elements not found');
            return;
        }
        
        // Set company name and period
        const companyName = data.metadata?.company_name || 'Company Name';
        const startDate = data.metadata?.financial_year_start || '';
        const endDate = data.metadata?.financial_year_end || '';
        const periodText = startDate && endDate ? `${startDate} - ${endDate}` : 'Current Period';
        
        plCompanyName.textContent = companyName;
        plPeriod.textContent = periodText;
        
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
        let incomeRowsHTML = '';
        
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
            incomeRowsHTML += `
                <tr class="account-row ${amount === 0 ? 'zero-value' : ''}" data-account-num="${accountNum}" data-amount="${amount}">
                    <td class="account-col">${accountNum}</td>
                    <td class="name-col">${accountData.name || 'Unknown'}</td>
                    <td class="amount-col positive">${formatCurrency(displayAmount)}</td>
                </tr>
            `;
        }
        
        // Insert income rows
        if (incomeRowsHTML) {
            // Remove placeholder if we have rows
            if (incomePlaceholder) {
                incomePlaceholder.remove();
            }
            
            // Find the income section header
            const incomeSectionHeader = Array.from(plTable.querySelectorAll('.section-header')).find(
                header => header.textContent.trim() === 'Revenue'
            );
            
            if (incomeSectionHeader) {
                // Insert after the header
                incomeSectionHeader.insertAdjacentHTML('afterend', incomeRowsHTML);
            }
        }
        
        // Process expense accounts
        let totalExpenses = 0;
        let expenseRowsHTML = '';
        
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
            expenseRowsHTML += `
                <tr class="account-row ${amount === 0 ? 'zero-value' : ''}" data-account-num="${accountNum}" data-amount="${amount}">
                    <td class="account-col">${accountNum}</td>
                    <td class="name-col">${accountData.name || 'Unknown'}</td>
                    <td class="amount-col ${amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(amount)}</td>
                </tr>
            `;
        }
        
        // Insert expense rows
        if (expenseRowsHTML) {
            // Remove placeholder if we have rows
            if (expensesPlaceholder) {
                expensesPlaceholder.remove();
            }
            
            // Find the expenses section header
            const expensesSectionHeader = Array.from(plTable.querySelectorAll('.section-header')).find(
                header => header.textContent.trim() === 'Expenses'
            );
            
            if (expensesSectionHeader) {
                // Insert after the header
                expensesSectionHeader.insertAdjacentHTML('afterend', expenseRowsHTML);
            }
        }
        
        // Update totals and net result
        const displayTotalIncome = Math.abs(incomeStatement.total_income || totalIncome);
        const displayTotalExpenses = incomeStatement.total_expenses || totalExpenses;
        const netIncome = displayTotalIncome - displayTotalExpenses;
        
        totalIncomeSpan.textContent = formatCurrency(displayTotalIncome);
        totalIncomeSpan.className = 'amount-col positive';
        
        totalExpensesSpan.textContent = formatCurrency(displayTotalExpenses);
        totalExpensesSpan.className = 'amount-col ' + (displayTotalExpenses >= 0 ? 'positive' : 'negative');
        
        netResultSpan.textContent = formatCurrency(netIncome);
        netResultSpan.className = 'amount-col ' + (netIncome >= 0 ? 'positive' : 'negative');
        
        // Add event listeners for the action buttons
        document.getElementById('print-pl')?.addEventListener('click', () => {
            window.print();
        });
        
        document.getElementById('export-pl-pdf')?.addEventListener('click', () => {
            alert('PDF export functionality would be implemented here.');
            // In a real implementation, this would use a library like jsPDF to generate a PDF
        });
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
        data.verifications.forEach(verification => {
            if (!verification.transactions) return;
            
            verification.transactions.forEach(transaction => {
                // Format verification number using standardized fields
                let verNumber = '';
                if (verification.series && verification.number) {
                    verNumber = `${verification.series}${verification.number}`;
                } else if (verification.number) {
                    verNumber = verification.number;
                }
                
                // Get account name from the standardized data model
                let accountName = transaction.account_name || "Unknown";
                if (!accountName || accountName === "Unknown") {
                    if (data.accounts && data.accounts[transaction.account]) {
                        accountName = data.accounts[transaction.account].name || "Unknown";
                    }
                }
                
                // Use the standardized transaction fields directly
                transactions.push({
                    verification: verNumber,
                    date: transaction.date || verification.date || '',
                    account: transaction.account,
                    account_name: accountName,
                    text: transaction.text || verification.text || '',
                    amount: transaction.amount || 0
                });
            });
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
                document.body.appendChild(downloadLink);
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(downloadLink.href);
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
        const ledgerTransactions = document.getElementById('ledger-transactions');
        const accountCount = document.getElementById('account-count');
        
        // Get company info elements
        const ledgerCompanyName = document.getElementById('ledger-company-name');
        const ledgerPeriod = document.getElementById('ledger-period').querySelector('span');
        
        if (!ledgerTab || !ledgerTransactions) {
            console.error('Ledger elements not found');
            return;
        }
        
        // Set company name and period
        const companyName = data.metadata?.company_name || 'Company Name';
        const startDate = data.metadata?.financial_year_start || '';
        const endDate = data.metadata?.financial_year_end || '';
        const periodText = startDate && endDate ? `${startDate} - ${endDate}` : 'Current Period';
        
        ledgerCompanyName.textContent = companyName;
        ledgerPeriod.textContent = periodText;
        
        // Clear previous content
        ledgerTransactions.innerHTML = '';
        
        // Extract data
        const accounts = data.accounts || {};
        const openingBalances = data.opening_balances || {};
        const year = data.metadata && data.metadata.financial_year_start ? 
            data.metadata.financial_year_start.substring(0, 4) : new Date().getFullYear().toString();
            
        // Create a map to store account transactions
        const accountTransactionsMap = new Map();
        
        // Initialize map with all accounts
        Object.entries(accounts).forEach(([accountNum, accountData]) => {
            accountTransactionsMap.set(accountNum, {
                name: accountData.name || '',
                type: accountData.type || 'Other',
                transactions: []
            });
        });
        
        // Collect transactions for each account
        if (data.verifications) {
            data.verifications.forEach(verification => {
                if (!verification.transactions) return;
                
                const verNumber = verification.id || '';
                
                verification.transactions.forEach(transaction => {
                    const accountNumber = transaction.account;
                    const accountName = transaction.account_name || accounts[accountNumber]?.name || '';
                    
                    // If this account is not in our map yet, add it
                    if (!accountTransactionsMap.has(accountNumber)) {
                        // Try to determine account type from account number
                        let type = 'Other';
                        const accNum = parseInt(accountNumber);
                        
                        if (accNum >= 1000 && accNum < 2000) {
                            type = 'Asset';
                        } else if (accNum >= 2000 && accNum < 3000) {
                            type = 'Equity';
                        } else if (accNum >= 3000 && accNum < 4000) {
                            type = 'Liability';
                        } else if (accNum >= 3000 && accNum < 4000) {
                            type = 'Income';
                        } else if (accNum >= 5000 && accNum < 8000) {
                            type = 'Expense';
                        }
                        
                        accountTransactionsMap.set(accountNumber, {
                            name: accountName,
                            type: type,
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
        
        // Track accounts with transactions
        let accountsWithTransactions = 0;
        
        // Process each account
        sortedAccounts.forEach(accountNumber => {
            const accountData = accountTransactionsMap.get(accountNumber);
            const transactions = accountData.transactions;
            
            // Skip accounts with no transactions
            if (transactions.length === 0) {
                return;
            }
            
            accountsWithTransactions++;
            
            // Create account header row
            const accountHeaderRow = document.createElement('tr');
            accountHeaderRow.className = `account-header account-type-${accountData.type}`;
            accountHeaderRow.innerHTML = `
                <td colspan="6">${accountNumber} ${accountData.name}</td>
            `;
            ledgerTransactions.appendChild(accountHeaderRow);
            
            // Sort transactions by date
            transactions.sort((a, b) => {
                return a.date.localeCompare(b.date);
            });
            
            // Add opening balance row if available
            let runningBalance = 0;
            
            // Always show opening balance row, even if zero
            if (year && openingBalances[year] && openingBalances[year][accountNumber]) {
                const obEntry = openingBalances[year][accountNumber];
                const openingBalance = typeof obEntry === 'object' ? 
                    obEntry.amount || 0 : parseFloat(obEntry) || 0;
                runningBalance = openingBalance;
                
                const openingRow = document.createElement('tr');
                openingRow.className = 'opening-balance-row';
                openingRow.innerHTML = `
                    <td>${accountNumber}</td>
                    <td>${year}-01-01</td>
                    <td>-</td>
                    <td>Opening Balance</td>
                    <td class="amount-col"></td>
                    <td class="balance-col">${formatCurrency(openingBalance)}</td>
                `;
                
                ledgerTransactions.appendChild(openingRow);
            } else {
                // If no opening balance exists in the current year, check other years
                let foundOpeningBalance = false;
                let openingBalance = 0;
                
                // Check all available years for opening balances
                for (const yearKey in openingBalances) {
                    if (openingBalances[yearKey] && openingBalances[yearKey][accountNumber]) {
                        const obEntry = openingBalances[yearKey][accountNumber];
                        openingBalance = typeof obEntry === 'object' ? 
                            obEntry.amount || 0 : parseFloat(obEntry) || 0;
                        runningBalance = openingBalance;
                        foundOpeningBalance = true;
                        break;
                    }
                }
                
                // Only add a zero opening balance if we couldn't find any opening balance
                if (!foundOpeningBalance) {
                    openingBalance = 0;
                    runningBalance = 0;
                }
                
                const openingRow = document.createElement('tr');
                openingRow.className = 'opening-balance-row';
                openingRow.innerHTML = `
                    <td>${accountNumber}</td>
                    <td>${year}-01-01</td>
                    <td>-</td>
                    <td>Opening Balance</td>
                    <td class="amount-col"></td>
                    <td class="balance-col">${formatCurrency(openingBalance)}</td>
                `;
                
                ledgerTransactions.appendChild(openingRow);
            }
            
            // Add transactions to table with running balance
            transactions.forEach(transaction => {
                runningBalance += transaction.amount;
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${accountNumber}</td>
                    <td>${formatDate(transaction.date)}</td>
                    <td>${transaction.verification}</td>
                    <td>${transaction.text}</td>
                    <td class="amount-col ${transaction.amount >= 0 ? 'positive' : 'negative'}">${formatCurrency(transaction.amount)}</td>
                    <td class="balance-col">${formatCurrency(runningBalance)}</td>
                `;
                
                ledgerTransactions.appendChild(row);
            });
            
            // Add closing balance row
            const closingRow = document.createElement('tr');
            closingRow.className = 'closing-balance-row';
            closingRow.innerHTML = `
                <td>${accountNumber}</td>
                <td>${year}-12-31</td>
                <td>-</td>
                <td>Closing Balance</td>
                <td class="amount-col"></td>
                <td class="balance-col ${runningBalance >= 0 ? 'positive' : 'negative'}">${formatCurrency(runningBalance)}</td>
            `;
            ledgerTransactions.appendChild(closingRow);
        });
        
        // Update account count
        if (accountCount) {
            accountCount.textContent = accountsWithTransactions;
        }
        
        // If no accounts with transactions were found
        if (accountsWithTransactions === 0) {
            ledgerTransactions.innerHTML = '<tr><td colspan="6" class="empty-message">No transactions found for any account.</td></tr>';
        }
        
        // Add search functionality
        const ledgerSearch = document.getElementById('ledger-search');
        if (ledgerSearch) {
            ledgerSearch.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                let visibleAccounts = 0;
                let currentAccount = null;
                let accountVisible = false;
                let accountRows = [];
                
                // Get all rows in the table
                const rows = ledgerTransactions.querySelectorAll('tr');
                
                // Process each row
                rows.forEach(row => {
                    // Check if this is an account header row
                    if (row.classList.contains('account-header')) {
                        // If we were processing an account before, update its visibility
                        if (currentAccount !== null) {
                            accountRows.forEach(r => r.style.display = accountVisible ? '' : 'none');
                            if (accountVisible) visibleAccounts++;
                        }
                        
                        // Start processing a new account
                        currentAccount = row.textContent.trim();
                        accountVisible = currentAccount.toLowerCase().includes(searchTerm);
                        accountRows = [row];
                    } else {
                        // This is a transaction row for the current account
                        accountRows.push(row);
                        
                        // If the search term is found in this transaction, make the account visible
                        const rowText = row.textContent.toLowerCase();
                        if (rowText.includes(searchTerm)) {
                            accountVisible = true;
                        }
                    }
                });
                
                // Update the last account's visibility
                if (currentAccount !== null) {
                    accountRows.forEach(r => r.style.display = accountVisible ? '' : 'none');
                    if (accountVisible) visibleAccounts++;
                }
                
                // Update the account count
                if (accountCount) {
                    accountCount.textContent = visibleAccounts;
                }
            });
        }
        
        // Add event listeners for the action buttons
        document.getElementById('print-ledger')?.addEventListener('click', () => {
            window.print();
        });
        
        document.getElementById('export-ledger-pdf')?.addEventListener('click', () => {
            alert('PDF export functionality would be implemented here.');
            // In a real implementation, this would use a library like jsPDF to generate a PDF
        });
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
        const year = Object.keys(openingBalances)[0] || '';
        
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
            const amount = typeof balanceEntry === 'object' ? 
                balanceEntry.amount || 0 : parseFloat(balanceEntry) || 0;
            
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
