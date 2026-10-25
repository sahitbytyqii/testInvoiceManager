const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Struktura fillestare e databazës
const defaultData = {
    users: [
        // Admin default: admin / admin123
        { id: 1, username: 'admin', password: 'admin123', role: 'admin' }
    ],
    invoices: [],
    nextUserId: 2,
    nextInvoiceId: 1
};

// Lexon databazën nga file
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
            return JSON.parse(JSON.stringify(defaultData));
        }
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error('Gabim leximi i databazës:', err.message);
        return JSON.parse(JSON.stringify(defaultData));
    }
}

// Shkruan databazën në file
function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Gabim shkrimi i databazës:', err.message);
    }
}

// Krijo file-in nëse nuk ekziston
readDB();
console.log('✅ Databaza JSON u inicializua:', DB_FILE);

module.exports = { readDB, writeDB };