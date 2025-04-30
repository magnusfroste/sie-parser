// This is a temporary fix for the Balance Sheet view
// The issue is that the movement column is showing the closing balance values
// instead of the actual movement (difference between closing and opening balances)

// The correct calculation for movement is:
// const movement = closingBalance - openingBalance;

// But there might be an issue with how we're retrieving the closing balance from the data model
// Let's check the data structure to see what's happening
