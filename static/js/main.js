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
                // Display a success message
                const sieData = data.data || data;
                
                // Get SIE version, program, and year with better fallbacks
                let sieVersion = '4';
                if (sieData.metadata && sieData.metadata.sie_version) {
                    sieVersion = sieData.metadata.sie_version;
                }
                
                // Determine program with better identification
                let program = 'SIE';
                if (sieData.metadata && sieData.metadata.program) {
                    program = sieData.metadata.program;
                    // Clean up common program names
                    if (program.toLowerCase().includes('bokio')) {
                        program = 'Bokio';
                    } else if (program.toLowerCase().includes('fortnox')) {
                        program = 'Fortnox';
                    } else if (program.toLowerCase().includes('dooer')) {
                        program = 'Dooer';
                    }
                }
                
                // Determine fiscal year with better fallbacks
                let year = '';
                if (sieData.metadata && sieData.metadata.financial_year_start) {
                    year = sieData.metadata.financial_year_start.substring(0, 4);
                } else if (sieData.metadata && sieData.metadata.fiscal_years && sieData.metadata.fiscal_years['0']) {
                    const currentFiscalYear = sieData.metadata.fiscal_years['0'];
                    if (currentFiscalYear.start_date) {
                        year = currentFiscalYear.start_date.substring(0, 4);
                    }
                } else if (sieData.metadata && sieData.metadata.generation_date) {
                    // Use generation date as a fallback
                    year = sieData.metadata.generation_date.substring(0, 4);
                }
                
                // Avoid unknown in the status message
                let statusMessage = `Successfully parsed SIE file`;
                if (program !== 'SIE') {
                    statusMessage = `Successfully parsed ${program} SIE file`;
                }
                if (year) {
                    statusMessage += ` for fiscal year ${year}`;
                }
                
                console.log("SIE metadata for status message:", sieData.metadata);
                showStatus(statusMessage, 'success');
                
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
            
            try {
                populateBalanceHistory(data);
            } catch (e) {
                console.error("Error populating balance history:", e);
            }
            
            // Result History view has been removed for reimplementation
            // Will be rebuilt with proper #RES 0 and #RES -1 data handling
            
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
        console.log("updateLLMPreview function called");
        
        try {
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
        } catch (error) {
            console.error("Error updating LLM preview:", error);
            const previewElement = document.getElementById('llm-preview');
            previewElement.innerHTML = `<div class="error-message">Error updating preview: ${error.message}</div>`;
        }
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
        
        // Add balance history analysis if selected
        if (includePreviousYears) {
            console.log("Including balance history in LLM export");
            const balanceHistory = generateBalanceHistoryAnalysis();
            console.log("Generated balance history:", balanceHistory);
            result.balance_history = balanceHistory;
        }
        
        return result;
    }
    
    // Generate a simple income statement based on detail level
    function generateSimpleIncomeStatement(detailLevel) {
        if (!processedData || !processedData.income_statement) {
            console.log("Income statement data not available");
            return { error: "Income statement data not available" };
        }
        
        console.log("Income statement data:", processedData.income_statement);
        
        const currentYear = processedData.metadata.financial_year_end 
            ? processedData.metadata.financial_year_end.substring(0, 4) 
            : new Date().getFullYear().toString();
        
        const incomeData = {
            period: currentYear,
            currency: processedData.metadata.currency || 'SEK',
            data: {}
        };
        
        // Get income statement data directly from the data model
        const data = processedData.income_statement;
        
        if (detailLevel === 'high') {
            // High level - only major categories
            incomeData.data = {
                revenue: {
                    total_revenue: parseFloat(data.total_income) || 0
                },
                expenses: {
                    total_expenses: parseFloat(data.total_expenses) || 0
                },
                net_result: parseFloat(data.net_income) || 0
            };
        } else if (detailLevel === 'medium') {
            // Medium level - major categories with subcategories
            const incomeCategories = {};
            const expenseCategories = {};
            
            // Process income categories
            if (data.income) {
                Object.entries(data.income).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        const category = `Income ${accNum.substring(0, 2)}xx`;
                        if (!incomeCategories[category]) {
                            incomeCategories[category] = 0;
                        }
                        incomeCategories[category] += parseFloat(details.amount) || 0;
                    }
                });
            }
            
            // Process expense categories
            if (data.expenses) {
                Object.entries(data.expenses).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        const category = `Expense ${accNum.substring(0, 2)}xx`;
                        if (!expenseCategories[category]) {
                            expenseCategories[category] = 0;
                        }
                        expenseCategories[category] += parseFloat(details.amount) || 0;
                    }
                });
            }
            
            incomeData.data = {
                revenue: {
                    categories: incomeCategories,
                    total_revenue: parseFloat(data.total_income) || 0
                },
                expenses: {
                    categories: expenseCategories,
                    total_expenses: parseFloat(data.total_expenses) || 0
                },
                net_result: parseFloat(data.net_income) || 0
            };
        } else {
            // Detailed level - all accounts
            const incomeAccounts = {};
            const expenseAccounts = {};
            
            // Process all income accounts
            if (data.income) {
                Object.entries(data.income).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        incomeAccounts[`${accNum} - ${details.name || 'Unknown'}`] = parseFloat(details.amount) || 0;
                    }
                });
            }
            
            // Process all expense accounts
            if (data.expenses) {
                Object.entries(data.expenses).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        expenseAccounts[`${accNum} - ${details.name || 'Unknown'}`] = parseFloat(details.amount) || 0;
                    }
                });
            }
            
            incomeData.data = {
                revenue: {
                    accounts: incomeAccounts,
                    total_revenue: parseFloat(data.total_income) || 0
                },
                expenses: {
                    accounts: expenseAccounts,
                    total_expenses: parseFloat(data.total_expenses) || 0
                },
                net_result: parseFloat(data.net_income) || 0
            };
        }
        
        return incomeData;
    }
    
    // Generate a simple balance sheet based on detail level
    function generateSimpleBalanceSheet(detailLevel) {
        if (!processedData || !processedData.balance_sheet) {
            console.log("Balance sheet data not available");
            return { error: "Balance sheet data not available" };
        }
        
        console.log("Balance sheet data:", processedData.balance_sheet);
        
        const balanceData = {
            as_of_date: processedData.metadata.financial_year_end || 'Unknown',
            currency: processedData.metadata.currency || 'SEK',
            data: {}
        };
        
        // Get balance sheet data directly from the data model
        const data = processedData.balance_sheet;
        
        if (detailLevel === 'high') {
            // High level - only major categories
            balanceData.data = {
                assets: {
                    total_assets: parseFloat(data.total_assets) || 0
                },
                liabilities: {
                    total_liabilities: parseFloat(data.total_liabilities_equity) - (parseFloat(data.equity?.total_equity) || 0) || 0
                },
                equity: {
                    total_equity: parseFloat(data.equity?.total_equity) || 0
                }
            };
        } else if (detailLevel === 'medium') {
            // Medium level - major categories with subcategories
            const assetCategories = {};
            const liabilityCategories = {};
            const equityCategories = {};
            
            // Process asset categories
            if (data.assets) {
                Object.entries(data.assets).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        const category = `Asset ${accNum.substring(0, 2)}xx`;
                        if (!assetCategories[category]) {
                            assetCategories[category] = 0;
                        }
                        assetCategories[category] += parseFloat(details.balance) || 0;
                    }
                });
            }
            
            // Process liability and equity categories
            if (data.liabilities) {
                Object.entries(data.liabilities).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        // Equity accounts typically start with 20-21
                        if (accNum.startsWith('20') || accNum.startsWith('21')) {
                            const category = `Equity ${accNum.substring(0, 2)}xx`;
                            if (!equityCategories[category]) {
                                equityCategories[category] = 0;
                            }
                            equityCategories[category] += parseFloat(details.balance) || 0;
                        } else {
                            const category = `Liability ${accNum.substring(0, 2)}xx`;
                            if (!liabilityCategories[category]) {
                                liabilityCategories[category] = 0;
                            }
                            liabilityCategories[category] += parseFloat(details.balance) || 0;
                        }
                    }
                });
            }
            
            balanceData.data = {
                assets: {
                    categories: assetCategories,
                    total_assets: parseFloat(data.total_assets) || 0
                },
                liabilities: {
                    categories: liabilityCategories,
                    total_liabilities: parseFloat(data.total_liabilities_equity) - (parseFloat(data.equity?.total_equity) || 0) || 0
                },
                equity: {
                    categories: equityCategories,
                    total_equity: parseFloat(data.equity?.total_equity) || 0
                }
            };
        } else {
            // Detailed level - all accounts
            const assetAccounts = {};
            const liabilityAccounts = {};
            const equityAccounts = {};
            
            // Process all asset accounts
            if (data.assets) {
                Object.entries(data.assets).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        assetAccounts[`${accNum} - ${details.name || 'Unknown'}`] = parseFloat(details.balance) || 0;
                    }
                });
            }
            
            // Process all liability and equity accounts
            if (data.liabilities) {
                Object.entries(data.liabilities).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        // Equity accounts typically start with 20-21
                        if (accNum.startsWith('20') || accNum.startsWith('21')) {
                            equityAccounts[`${accNum} - ${details.name || 'Unknown'}`] = parseFloat(details.balance) || 0;
                        } else {
                            liabilityAccounts[`${accNum} - ${details.name || 'Unknown'}`] = parseFloat(details.balance) || 0;
                        }
                    }
                });
            }
            
            balanceData.data = {
                assets: {
                    accounts: assetAccounts,
                    total_assets: parseFloat(data.total_assets) || 0
                },
                liabilities: {
                    accounts: liabilityAccounts,
                    total_liabilities: parseFloat(data.total_liabilities_equity) - (parseFloat(data.equity?.total_equity) || 0) || 0
                },
                equity: {
                    accounts: equityAccounts,
                    total_equity: parseFloat(data.equity?.total_equity) || 0
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
        const totalLiabilities = parseFloat(balanceSheet.total_liabilities_equity) - (parseFloat(balanceSheet.equity?.total_equity) || 0) || 0;
        const totalEquity = parseFloat(balanceSheet.equity?.total_equity) || 0;
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
                    ? balanceSheet.assets.current_assets.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0)
                    : 0;
                
                // Extract quick assets (cash, receivables)
                const cashAccounts = balanceSheet.assets.current_assets.filter(acc => 
                    acc.number.startsWith('19') || // Cash and bank accounts
                    acc.number.startsWith('15') || // Short-term receivables
                    acc.number.startsWith('16') || // Short-term receivables
                    acc.number.startsWith('17')    // Short-term receivables
                );
                
                quickAssets = cashAccounts.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0);
            }
            
            // Extract current liabilities
            if (balanceSheet.liabilities.current_liabilities) {
                currentLiabilities = Array.isArray(balanceSheet.liabilities.current_liabilities)
                    ? balanceSheet.liabilities.current_liabilities.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0)
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
        console.log("generateLLMExport function called");
        
        const detailLevel = document.querySelector('input[name="detail-level"]:checked').value;
        const includePreviousYears = document.getElementById('include-previous-years').checked;
        const includeSummary = document.getElementById('include-summary').checked;
        const includeIncome = document.getElementById('include-income').checked;
        const includeBalance = document.getElementById('include-balance').checked;
        const includeKeyRatios = document.getElementById('include-key-ratios').checked;
        
        console.log("Options:", {
            detailLevel,
            includePreviousYears,
            includeSummary,
            includeIncome,
            includeBalance,
            includeKeyRatios
        });
        
        try {
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
        } catch (error) {
            console.error("Error generating LLM export:", error);
            const previewElement = document.getElementById('llm-preview');
            previewElement.innerHTML = `<div class="error-message">Error generating LLM export: ${error.message}</div>`;
        }
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
        
        for (const accountNumber of sortedIncomeAccounts) {
            // Get account data
            const accountData = incomeStatement.income && incomeStatement.income[accountNumber] ? 
                incomeStatement.income[accountNumber] : 
                { name: accounts[accountNumber].name || '', amount: 0 };
            
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
                <tr class="account-row ${amount === 0 ? 'zero-value' : ''}" data-account-num="${accountNumber}" data-amount="${amount}">
                    <td class="account-col">${accountNumber}</td>
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
        
        for (const accountNumber of sortedExpenseAccounts) {
            // Get account data
            const accountData = incomeStatement.expenses && incomeStatement.expenses[accountNumber] ? 
                incomeStatement.expenses[accountNumber] : 
                { name: accounts[accountNumber].name || '', amount: 0 };
            
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
                <tr class="account-row ${amount === 0 ? 'zero-value' : ''}" data-account-num="${accountNumber}" data-amount="${amount}">
                    <td class="account-col">${accountNumber}</td>
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
                document.body.appendChild(downloadLink);
                downloadLink.click();
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
                const copyButton = document.getElementById('copy-llm-export');
                const originalText = copyButton.textContent;
                
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = originalText;
                }, 2000);
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
    
    // Populate balance history tab
    function populateBalanceHistory(data) {
        console.log("Populating balance history...");
        console.log("Full data:", JSON.stringify(data, null, 2));
        
        const tableBody = document.getElementById('balance-history-body');
        const companyName = document.getElementById('balance-history-company-name');
        const periodElement = document.getElementById('balance-history-period').querySelector('span');
        
        // Clear previous content
        tableBody.innerHTML = '';
        
        // Set company name and period
        companyName.textContent = data.metadata.company_name || 'Company Name';
        periodElement.textContent = `${data.metadata.financial_year_start || ''} - ${data.metadata.financial_year_end || ''}`;
        
        // Get all accounts from the data
        const accounts = data.accounts || {};
        
        // Get RAR year from metadata (the financial year in the SIE file)
        // This is the reference year for all relative years in the SIE file
        let rarYear;
        
        // TEMPORARY FIX: Force the year to be 2022 for testing
        // This is just to verify that the issue is with the year calculation
        rarYear = 2022;
        console.log("FORCED YEAR TO 2022 FOR TESTING");
        
        /* Commenting out the previous logic for now
        // First check if we have fiscal years data with RAR 0
        if (data.metadata.fiscal_years && data.metadata.fiscal_years['0'] && 
            data.metadata.fiscal_years['0'].end_date && 
            data.metadata.fiscal_years['0'].end_date.length >= 4) {
            
            rarYear = parseInt(data.metadata.fiscal_years['0'].end_date.substring(0, 4));
            console.log("Using RAR 0 end date year:", rarYear);
        }
        // Then try current_fiscal_year_end_year
        else if (data.metadata.current_fiscal_year_end_year) {
            rarYear = parseInt(data.metadata.current_fiscal_year_end_year);
            console.log("Using current_fiscal_year_end_year:", rarYear);
        } 
        // Then try from the financial_year_end field
        else if (data.metadata.financial_year_end) {
            rarYear = parseInt(data.metadata.financial_year_end.substring(0, 4));
            console.log("Using financial_year_end:", rarYear);
        } 
        // Then try from the financial_year_start field
        else if (data.metadata.financial_year_start) {
            rarYear = parseInt(data.metadata.financial_year_start.substring(0, 4));
            console.log("Using financial_year_start:", rarYear);
        } 
        // Fallback if no financial year data is available
        else {
            // DO NOT use current year as fallback - this is causing the issue
            // Instead, look at the data we have and make a best guess
            if (Object.keys(data.opening_balances || {}).length > 0) {
                // If we have opening balances, assume the largest year is the current year
                const maxYear = Math.max(...Object.keys(data.opening_balances).map(y => parseInt(y) || 0));
                rarYear = new Date().getFullYear() + maxYear;
                console.log("Estimated year from opening balances:", rarYear);
            } else if (Object.keys(data.closing_balances || {}).length > 0) {
                // If we have closing balances, assume the largest year is the current year
                const maxYear = Math.max(...Object.keys(data.closing_balances).map(y => parseInt(y) || 0));
                rarYear = new Date().getFullYear() + maxYear;
                console.log("Estimated year from closing balances:", rarYear);
            } else {
                // Last resort fallback
                rarYear = new Date().getFullYear();
                console.log("Using current year as last resort fallback:", rarYear);
            }
        }
        */
        console.log("RAR year:", rarYear);
        console.log("Opening balances:", data.opening_balances);
        console.log("Closing balances:", data.closing_balances);
        console.log("Fiscal years:", data.metadata.fiscal_years);
        
        // Determine all available years in the data
        // Filter out empty year keys to prevent the "2022 (UB)" column without a year indicator
        const allIbYears = Object.keys(data.opening_balances || {})
            .filter(year => year !== "" && year !== undefined)
            .sort();
        const allUbYears = Object.keys(data.closing_balances || {})
            .filter(year => year !== "" && year !== undefined)
            .sort();
        
        console.log("IB years (filtered):", allIbYears);
        console.log("UB years (filtered):", allUbYears);
        
        if (allIbYears.length === 0 && allUbYears.length === 0) {
            console.log("No balance history years found in the data");
            document.querySelector('.balance-history-container').innerHTML = '<div class="no-data-message">No balance history data available in this SIE file.</div>';
            return;
        }
        
        // Create a map to translate relative years to actual calendar years
        const yearMap = {};
        
        // Map for IB (Opening Balance)
        allIbYears.forEach(relativeYear => {
            const yearOffset = parseInt(relativeYear) || 0;
            const actualYear = (rarYear + yearOffset).toString();
            
            // Get fiscal year info if available
            let fiscalYearInfo = '';
            if (data.metadata.fiscal_years && data.metadata.fiscal_years[relativeYear]) {
                const fy = data.metadata.fiscal_years[relativeYear];
                if (fy.start_date && fy.end_date) {
                    fiscalYearInfo = ` (${formatDate(fy.start_date)} - ${formatDate(fy.end_date)})`;
                }
            }
            
            console.log(`Creating year map for IB ${relativeYear}, actualYear: ${actualYear}`);
            
            yearMap[`IB ${relativeYear}`] = {
                relativeYear,
                actualYear,
                type: 'IB',
                displayName: `${actualYear} (IB ${relativeYear})${fiscalYearInfo}`,
                shortName: `${actualYear} (IB ${relativeYear})`
            };
        });
        
        // Map for UB (Closing Balance)
        allUbYears.forEach(relativeYear => {
            const yearOffset = parseInt(relativeYear) || 0;
            const actualYear = (rarYear + yearOffset).toString();
            
            // Get fiscal year info if available
            let fiscalYearInfo = '';
            if (data.metadata.fiscal_years && data.metadata.fiscal_years[relativeYear]) {
                const fy = data.metadata.fiscal_years[relativeYear];
                if (fy.start_date && fy.end_date) {
                    fiscalYearInfo = ` (${formatDate(fy.start_date)} - ${formatDate(fy.end_date)})`;
                }
            }
            
            console.log(`Creating year map for UB ${relativeYear}, actualYear: ${actualYear}`);
            
            yearMap[`UB ${relativeYear}`] = {
                relativeYear,
                actualYear,
                type: 'UB',
                displayName: `${actualYear} (UB ${relativeYear})${fiscalYearInfo}`,
                shortName: `${actualYear} (UB ${relativeYear})`
            };
        });
        
        console.log("Year map:", yearMap);
        
        // Sort all years for display (chronological order)
        const allYearKeys = Object.keys(yearMap).sort((a, b) => {
            const yearA = parseInt(yearMap[a].actualYear);
            const yearB = parseInt(yearMap[b].actualYear);
            if (yearA === yearB) {
                // If same year, IB comes before UB
                return a.startsWith('IB') ? -1 : 1;
            }
            return yearA - yearB;
        });
        
        console.log("All year keys (sorted):", allYearKeys);
        
        // Create table header with all available years
        const headerRow = document.querySelector('.balance-history-table thead tr');
        headerRow.innerHTML = `
            <th class="account-col">Account</th>
            <th class="name-col">Description</th>
        `;
        
        // Add column for each year
        allYearKeys.forEach(yearKey => {
            console.log("Creating column for year key:", yearKey, "with info:", yearMap[yearKey]);
            const th = document.createElement('th');
            th.classList.add('amount-col');
            th.textContent = yearMap[yearKey].displayName;
            th.dataset.yearKey = yearKey;
            headerRow.appendChild(th);
        });
        
        // Create a map to store account balances
        const accountBalances = {};
        
        // Process each account
        Object.keys(accounts).forEach(accountNum => {
            const accountName = accounts[accountNum].name || '';
            
            // Initialize account in the map if not exists
            if (!accountBalances[accountNum]) {
                accountBalances[accountNum] = {
                    number: accountNum,
                    name: accountName,
                    balances: {}
                };
            }
        });
        
        // Process opening balances (IB)
        console.log("Processing opening balances:", data.opening_balances);
        Object.keys(data.opening_balances || {}).forEach(year => {
            console.log("Processing IB year:", year, "Type:", typeof year);
            
            // Skip empty year keys (this is what's causing the extra "2022 (UB)" column)
            if (year === "" || year === undefined) {
                console.log("Skipping empty year key in IB data");
                return;
            }
            
            const yearBalances = data.opening_balances[year] || {};
            
            Object.keys(yearBalances).forEach(accountNum => {
                // Initialize account in the map if not exists
                if (!accountBalances[accountNum]) {
                    accountBalances[accountNum] = {
                        number: accountNum,
                        name: accounts[accountNum]?.name || '',
                        balances: {}
                    };
                }
                
                // Add opening balance for this year
                // Handle both direct number values and object values with amount property
                const ibValue = typeof yearBalances[accountNum] === 'object' ? 
                    yearBalances[accountNum].amount : yearBalances[accountNum];
                accountBalances[accountNum].balances[`IB ${year}`] = ibValue;
            });
        });
        
        // Process closing balances (UB)
        console.log("Processing closing balances:", data.closing_balances);
        Object.keys(data.closing_balances || {}).forEach(year => {
            console.log("Processing UB year:", year, "Type:", typeof year);
            
            // Skip empty year keys (this is what's causing the extra "2022 (UB)" column)
            if (year === "" || year === undefined) {
                console.log("Skipping empty year key in UB data");
                return;
            }
            
            const yearBalances = data.closing_balances[year] || {};
            
            Object.keys(yearBalances).forEach(accountNum => {
                // Initialize account in the map if not exists
                if (!accountBalances[accountNum]) {
                    accountBalances[accountNum] = {
                        number: accountNum,
                        name: accounts[accountNum]?.name || '',
                        balances: {}
                    };
                }
                
                // Add closing balance for this year
                console.log(`Adding UB balance for account ${accountNum}, year ${year}:`, yearBalances[accountNum]);
                // Handle both direct number values and object values with amount property
                const ubValue = typeof yearBalances[accountNum] === 'object' ? 
                    yearBalances[accountNum].amount : yearBalances[accountNum];
                accountBalances[accountNum].balances[`UB ${year}`] = ubValue;
            });
        });
        
        // Sort accounts by account number
        const sortedAccounts = Object.values(accountBalances).sort((a, b) => {
            return a.number.localeCompare(b.number);
        });
        
        console.log("Sorted accounts:", sortedAccounts);
        
        // Create table rows for each account
        sortedAccounts.forEach(account => {
            // Skip accounts with no balances if show-non-zero is checked
            const hasBalances = allYearKeys.some(yearKey => account.balances[yearKey]);
            
            if (document.getElementById('balance-history-show-non-zero')?.checked && !hasBalances) {
                return;
            }
            
            // Create account row
            const row = document.createElement('tr');
            
            // Account number cell
            const accountNumCell = document.createElement('td');
            accountNumCell.textContent = account.number;
            accountNumCell.classList.add('account-col');
            row.appendChild(accountNumCell);
            
            // Account name cell
            const accountNameCell = document.createElement('td');
            accountNameCell.textContent = account.name;
            accountNameCell.classList.add('name-col');
            row.appendChild(accountNameCell);
            
            // Add cells for each year
            allYearKeys.forEach(yearKey => {
                const cell = document.createElement('td');
                cell.classList.add('amount-col');
                cell.dataset.yearKey = yearKey;
                
                const amount = account.balances[yearKey] || 0;
                cell.textContent = formatCurrency(amount, true);
                
                if (amount !== 0) {
                    cell.classList.add(amount > 0 ? 'positive' : 'negative');
                }
                
                row.appendChild(cell);
            });
            
            tableBody.appendChild(row);
        });
        
        // Add data attributes for filtering
        const rows = tableBody.querySelectorAll('tr.balance-history-row');
        rows.forEach(row => {
            row.dataset.visible = 'true';
        });
        
        // Add year filter dropdown
        const filterControls = document.querySelector('.balance-history-header .filter-controls');
        
        // Create year filter if it doesn't exist
        if (!document.getElementById('balance-history-year-filter')) {
            const yearFilterContainer = document.createElement('div');
            yearFilterContainer.classList.add('year-filter-container');
            
            const yearFilterLabel = document.createElement('label');
            yearFilterLabel.textContent = 'Filter by Year: ';
            yearFilterLabel.htmlFor = 'balance-history-year-filter';
            
            const yearFilter = document.createElement('select');
            yearFilter.id = 'balance-history-year-filter';
            
            // Add "All Years" option
            const allYearsOption = document.createElement('option');
            allYearsOption.value = 'all';
            allYearsOption.textContent = 'All Years';
            yearFilter.appendChild(allYearsOption);
            
            // Add option for each actual calendar year
            const uniqueCalendarYears = [...new Set(Object.values(yearMap).map(y => y.actualYear))].sort();
            
            uniqueCalendarYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                
                // Add fiscal year info if available for this year
                let fiscalYearInfo = '';
                const matchingYearKeys = Object.keys(yearMap).filter(key => 
                    yearMap[key].actualYear === year && 
                    yearMap[key].relativeYear === '0'
                );
                
                if (matchingYearKeys.length > 0) {
                    const key = matchingYearKeys[0];
                    if (key.startsWith('UB')) {
                        fiscalYearInfo = ' (Current Year)';
                    }
                }
                
                option.textContent = `${year}${fiscalYearInfo}`;
                yearFilter.appendChild(option);
            });
            
            // Add event listener for year filter
            yearFilter.addEventListener('change', filterBalanceHistoryAccounts);
            
            yearFilterContainer.appendChild(yearFilterLabel);
            yearFilterContainer.appendChild(yearFilter);
            
            filterControls.appendChild(yearFilterContainer);
        }
        
        console.log("Balance history populated successfully");
    }
    
    // Filter balance history accounts based on search input, checkbox, and year filter
    function filterBalanceHistoryAccounts() {
        const searchInput = document.getElementById('balance-history-search');
        const showNonZero = document.getElementById('balance-history-show-non-zero').checked;
        const yearFilter = document.getElementById('balance-history-year-filter');
        const searchTerm = searchInput.value.toLowerCase();
        const selectedYear = yearFilter.value;
        
        const rows = document.querySelectorAll('#balance-history-body tr.balance-history-row');
        const headerCells = document.querySelectorAll('.balance-history-table thead th');
        
        // Show/hide columns based on year filter
        headerCells.forEach(cell => {
            if (cell.classList.contains('account-col') || cell.classList.contains('name-col')) {
                // Always show account and name columns
                cell.style.display = '';
            } else if (selectedYear === 'all') {
                // Show all year columns
                cell.style.display = '';
            } else {
                // Show only columns for the selected year
                const yearKey = cell.dataset.yearKey;
                const displayYear = cell.textContent.split(' ')[0];
                
                cell.style.display = (displayYear === selectedYear) ? '' : 'none';
            }
        });
        
        rows.forEach(row => {
            const accountNum = row.dataset.accountNum.toLowerCase();
            const accountName = row.dataset.accountName.toLowerCase();
            const matchesSearch = accountNum.includes(searchTerm) || accountName.includes(searchTerm);
            
            // Check if the account has any non-zero balances
            let hasNonZeroBalance = false;
            if (showNonZero) {
                const amountCells = row.querySelectorAll('td.amount-col');
                amountCells.forEach(cell => {
                    // Only check visible cells if filtering by year
                    if (selectedYear === 'all' || cell.style.display !== 'none') {
                        if (cell.textContent.trim() !== '0,00 kr') {
                            hasNonZeroBalance = true;
                        }
                    }
                });
            } else {
                hasNonZeroBalance = true; // Show all if checkbox is not checked
            }
            
            // Show/hide cells based on year filter
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                if (index < 2) {
                    // Always show account and name columns
                    cell.style.display = '';
                } else if (selectedYear === 'all') {
                    // Show all year columns
                    cell.style.display = '';
                } else {
                    // Show only columns for the selected year
                    const yearKey = cell.dataset.yearKey;
                    const displayYear = yearKey ? yearKey.split(' ')[0] : null;
                    
                    cell.style.display = headerCells[index].style.display;
                }
            });
            
            row.style.display = (matchesSearch && hasNonZeroBalance) ? '' : 'none';
            row.dataset.visible = (matchesSearch && hasNonZeroBalance) ? 'true' : 'false';
        });
    }
    
    // Result History tab has been removed for reimplementation
    // Will be rebuilt with proper #RES 0 and #RES -1 data handling
    
    // Generate a comprehensive balance history analysis for LLM
    function generateBalanceHistoryAnalysis() {
        if (!processedData || !processedData.opening_balances || !processedData.closing_balances) {
            console.log("Balance history data not available");
            return { error: "Balance history data not available" };
        }
        
        console.log("Generating balance history analysis");
        
        // Get all available years from opening and closing balances
        const years = new Set();
        
        // Add years from opening balances
        Object.keys(processedData.opening_balances || {}).forEach(year => {
            years.add(year);
        });
        
        // Add years from closing balances
        Object.keys(processedData.closing_balances || {}).forEach(year => {
            years.add(year);
        });
        
        // Add years from results if available
        Object.keys(processedData.results || {}).forEach(year => {
            years.add(year);
        });
        
        // Convert to array and sort (most recent first)
        const sortedYears = Array.from(years).sort((a, b) => {
            // Convert relative years (0, -1, -2) to absolute years
            const yearA = a === '0' ? parseInt(processedData.metadata.current_fiscal_year_end_year) : 
                         a.startsWith('-') ? parseInt(processedData.metadata.current_fiscal_year_end_year) + parseInt(a) : 
                         parseInt(a);
            const yearB = b === '0' ? parseInt(processedData.metadata.current_fiscal_year_end_year) : 
                         b.startsWith('-') ? parseInt(processedData.metadata.current_fiscal_year_end_year) + parseInt(b) : 
                         parseInt(b);
            return yearB - yearA;
        });
        
        const balanceHistory = {};
        
        // Process each year
        sortedYears.forEach(year => {
            // Convert relative year to calendar year for display
            const displayYear = year === '0' ? processedData.metadata.current_fiscal_year_end_year : 
                               year.startsWith('-') ? (parseInt(processedData.metadata.current_fiscal_year_end_year) + parseInt(year)).toString() : 
                               year;
            
            const yearData = {
                year_label: displayYear,
                relative_year: year,
                opening_balances: {},
                closing_balances: {},
                results: {},
                key_metrics: {}
            };
            
            // Group accounts by type
            const assetAccounts = {};
            const liabilityAccounts = {};
            const equityAccounts = {};
            const incomeAccounts = {};
            const expenseAccounts = {};
            
            // Process opening balances
            if (processedData.opening_balances && processedData.opening_balances[year]) {
                const openingBalances = processedData.opening_balances[year];
                
                // Calculate totals
                let totalAssets = 0;
                let totalLiabilities = 0;
                let totalEquity = 0;
                
                Object.entries(openingBalances).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        const amount = parseFloat(details.amount) || 0;
                        const accountType = determineAccountType(accNum);
                        const accountName = processedData.accounts[accNum]?.name || `Account ${accNum}`;
                        
                        // Add to the appropriate category
                        if (accountType === 'asset') {
                            assetAccounts[accNum] = {
                                account_number: accNum,
                                account_name: accountName,
                                opening_balance: amount,
                                closing_balance: null
                            };
                            totalAssets += amount;
                        } else if (accountType === 'liability') {
                            liabilityAccounts[accNum] = {
                                account_number: accNum,
                                account_name: accountName,
                                opening_balance: amount,
                                closing_balance: null
                            };
                            totalLiabilities += amount;
                        } else if (accountType === 'equity') {
                            equityAccounts[accNum] = {
                                account_number: accNum,
                                account_name: accountName,
                                opening_balance: amount,
                                closing_balance: null
                            };
                            totalEquity += amount;
                        }
                    }
                });
                
                // Store totals
                yearData.opening_balances = {
                    total_assets: totalAssets,
                    total_liabilities: totalLiabilities,
                    total_equity: totalEquity,
                    assets: assetAccounts,
                    liabilities: liabilityAccounts,
                    equity: equityAccounts
                };
            }
            
            // Process closing balances
            if (processedData.closing_balances && processedData.closing_balances[year]) {
                const closingBalances = processedData.closing_balances[year];
                
                // Calculate totals
                let totalAssets = 0;
                let totalLiabilities = 0;
                let totalEquity = 0;
                
                Object.entries(closingBalances).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        const amount = parseFloat(details.amount) || 0;
                        const accountType = determineAccountType(accNum);
                        const accountName = processedData.accounts[accNum]?.name || `Account ${accNum}`;
                        
                        // Add to the appropriate category
                        if (accountType === 'asset') {
                            if (assetAccounts[accNum]) {
                                assetAccounts[accNum].closing_balance = amount;
                            } else {
                                assetAccounts[accNum] = {
                                    account_number: accNum,
                                    account_name: accountName,
                                    opening_balance: null,
                                    closing_balance: amount
                                };
                            }
                            totalAssets += amount;
                        } else if (accountType === 'liability') {
                            if (liabilityAccounts[accNum]) {
                                liabilityAccounts[accNum].closing_balance = amount;
                            } else {
                                liabilityAccounts[accNum] = {
                                    account_number: accNum,
                                    account_name: accountName,
                                    opening_balance: null,
                                    closing_balance: amount
                                };
                            }
                            totalLiabilities += amount;
                        } else if (accountType === 'equity') {
                            if (equityAccounts[accNum]) {
                                equityAccounts[accNum].closing_balance = amount;
                            } else {
                                equityAccounts[accNum] = {
                                    account_number: accNum,
                                    account_name: accountName,
                                    opening_balance: null,
                                    closing_balance: amount
                                };
                            }
                            totalEquity += amount;
                        }
                    }
                });
                
                // Store totals
                yearData.closing_balances = {
                    total_assets: totalAssets,
                    total_liabilities: totalLiabilities,
                    total_equity: totalEquity,
                    assets: assetAccounts,
                    liabilities: liabilityAccounts,
                    equity: equityAccounts
                };
            }
            
            // Process results (income statement data)
            if (processedData.results && processedData.results[year]) {
                const resultsData = processedData.results[year];
                
                // Calculate totals
                let totalIncome = 0;
                let totalExpenses = 0;
                
                Object.entries(resultsData).forEach(([accNum, details]) => {
                    if (accNum && details) {
                        const amount = parseFloat(details.amount) || 0;
                        const accountType = determineAccountType(accNum);
                        const accountName = processedData.accounts[accNum]?.name || `Account ${accNum}`;
                        
                        // Add to the appropriate category
                        if (accountType === 'income') {
                            incomeAccounts[accNum] = {
                                account_number: accNum,
                                account_name: accountName,
                                amount: amount
                            };
                            totalIncome += amount;
                        } else if (accountType === 'expense') {
                            expenseAccounts[accNum] = {
                                account_number: accNum,
                                account_name: accountName,
                                amount: amount
                            };
                            totalExpenses += amount;
                        }
                    }
                });
                
                // Store totals
                yearData.results = {
                    total_income: totalIncome,
                    total_expenses: totalExpenses,
                    net_result: totalIncome - totalExpenses,
                    income_accounts: incomeAccounts,
                    expense_accounts: expenseAccounts
                };
            }
            
            // Calculate key metrics and changes
            if (yearData.opening_balances.total_assets && yearData.closing_balances.total_assets) {
                yearData.key_metrics = {
                    asset_growth: yearData.closing_balances.total_assets - yearData.opening_balances.total_assets,
                    asset_growth_percentage: yearData.opening_balances.total_assets ? 
                        ((yearData.closing_balances.total_assets - yearData.opening_balances.total_assets) / 
                         Math.abs(yearData.opening_balances.total_assets) * 100).toFixed(2) + '%' : 'N/A',
                    equity_growth: yearData.closing_balances.total_equity - yearData.opening_balances.total_equity,
                    equity_growth_percentage: yearData.opening_balances.total_equity ? 
                        ((yearData.closing_balances.total_equity - yearData.opening_balances.total_equity) / 
                         Math.abs(yearData.opening_balances.total_equity) * 100).toFixed(2) + '%' : 'N/A',
                    debt_to_equity_ratio: yearData.closing_balances.total_equity ? 
                        (yearData.closing_balances.total_liabilities / yearData.closing_balances.total_equity).toFixed(2) : 'N/A',
                    current_ratio: calculateCurrentRatio(yearData.closing_balances)
                };
            }
            
            balanceHistory[displayYear] = yearData;
        });
        
        return {
            company_name: processedData.metadata.company_name || 'Unknown',
            organization_number: processedData.metadata.organization_number || 'Unknown',
            fiscal_year: processedData.metadata.fiscal_year || 'Unknown',
            currency: processedData.metadata.currency || 'SEK',
            years_analyzed: sortedYears.length,
            balance_history: balanceHistory
        };
    }
    
    // Helper function to calculate current ratio
    function calculateCurrentRatio(balances) {
        if (!balances || !balances.assets || !balances.liabilities) {
            return 'N/A';
        }
        
        let currentAssets = 0;
        let currentLiabilities = 0;
        
        // Sum up current assets (typically accounts 1100-1999)
        Object.entries(balances.assets).forEach(([accNum, details]) => {
            if (accNum && details && details.closing_balance !== null) {
                const firstDigit = accNum.charAt(0);
                if (firstDigit === '1') {
                    currentAssets += details.closing_balance;
                }
            }
        });
        
        // Sum up current liabilities (typically accounts 2000-2999)
        Object.entries(balances.liabilities).forEach(([accNum, details]) => {
            if (accNum && details && details.closing_balance !== null) {
                const firstDigit = accNum.charAt(0);
                if (firstDigit === '2') {
                    currentLiabilities += details.closing_balance;
                }
            }
        });
        
        return currentLiabilities ? (currentAssets / currentLiabilities).toFixed(2) : 'N/A';
    }
    
    // Helper function to determine account type based on account number
    function determineAccountType(accountNumber) {
        // Convert to string and get first digit
        const accNum = accountNumber.toString();
        const firstDigit = accNum.charAt(0);
        
        // Swedish BAS account classification
        if (firstDigit === '1') {
            return 'asset';
        } else if (firstDigit === '2') {
            return 'liability';
        } else if (firstDigit === '3') {
            return 'income';
        } else if (firstDigit === '4' || firstDigit === '5' || firstDigit === '6' || firstDigit === '7') {
            return 'expense';
        } else if (firstDigit === '8') {
            return 'result';
        } else if (firstDigit === '9') {
            return 'other';
        } else {
            return 'unknown';
        }
    }
});
