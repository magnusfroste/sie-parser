// Debug script to be included in the HTML
document.addEventListener('DOMContentLoaded', function() {
    // Add a debug button
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'Debug Data';
    debugBtn.style.position = 'fixed';
    debugBtn.style.top = '10px';
    debugBtn.style.right = '10px';
    debugBtn.style.zIndex = '9999';
    debugBtn.addEventListener('click', function() {
        if (window.sieData) {
            console.log('Full Data:', window.sieData);
            console.log('Balance Sheet:', window.sieData.balance_sheet);
            console.log('Income Statement:', window.sieData.income_statement);
            console.log('Opening Balances:', window.sieData.opening_balances);
            console.log('Accounts:', window.sieData.accounts);
            
            // Check account types
            const accountTypes = {};
            for (const accNum in window.sieData.accounts) {
                const type = window.sieData.accounts[accNum].type;
                accountTypes[type] = (accountTypes[type] || 0) + 1;
            }
            console.log('Account Types:', accountTypes);
            
            alert('Debug data logged to console');
        } else {
            alert('No data loaded yet');
        }
    });
    document.body.appendChild(debugBtn);
});
