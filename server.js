const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { readDB, writeDB } = require('./database');

const app = express();
const PORT = 3000;

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ SESIONET (në memorie) ============
// token -> { id, username, role }
const sessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware: verifikon tokenin
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || !sessions[token]) {
        return res.status(401).json({ error: 'Duhet të bësh login.' });
    }

    req.user = sessions[token];
    next();
}

// ============ USERAT (veq admini) ============
app.get('/api/users', authenticateToken, (req, res) => {
    // Kontrollo nëse është admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Vetëm admin ka akses' });
    }

    const db = readDB();

    // Fshi fjalëkalimet para se t'i dërgojmë frontend-it (siguri!)
    const usersSafe = db.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role
    }));

    res.json(usersSafe);
});

// ============ AUTH ROUTES ============

// LOGIN
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Plotëso të gjitha fushat' });
    }

    const db = readDB();
    const user = db.users.find(u => u.username === username);

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Kredencialet e gabuara' });
    }

    const token = generateToken();
    sessions[token] = {
        id: user.id,
        username: user.username,
        role: user.role
    };

    res.json({
        message: 'Login i suksesshëm!',
        token,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

// REGJISTRIM
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Plotëso të gjitha fushat' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Fjalëkalimi min. 6 karaktere' });
    }

    const db = readDB();

    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Ky username ekziston' });
    }

    const newUser = {
        id: db.nextUserId++,
        username,
        password,
        role: 'user'
    };

    db.users.push(newUser);
    writeDB(db);

    res.status(201).json({ message: 'Përdoruesi u regjistrua me sukses!' });
});

// VERIFIKO TOKEN
app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// LOGOUT
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) delete sessions[token];
    res.json({ message: 'Logout i suksesshëm' });
});

// ============ INVOICE ROUTES (të mbrojtura) ============

// SHFAQ TË GJITHA
app.get('/api/invoices', authenticateToken, (req, res) => {
    const db = readDB();
    res.json(db.invoices.sort((a, b) => b.id - a.id));
});

// KËRKO
app.get('/api/invoices/search/:term', authenticateToken, (req, res) => {
    const db = readDB();
    const term = req.params.term.toLowerCase();
    const results = db.invoices.filter(inv =>
        inv.nr_fatures.toLowerCase().includes(term) ||
        inv.klienti.toLowerCase().includes(term) ||
        inv.lloji.toLowerCase().includes(term)
    );
    res.json(results);
});

// STATISTIKA ME BILANC (Blerje dhe Shpenzim ulin bilancin)
app.get('/api/stats', authenticateToken, (req, res) => {
    const db = readDB();
    const stats = {
        Blerje: { total: 0, nr: 0 },
        Shitje: { total: 0, nr: 0 },
        Shpenzim: { total: 0, nr: 0 }
    };

    db.invoices.forEach(inv => {
        if (stats[inv.lloji]) {
            stats[inv.lloji].total += Number(inv.shuma);
            stats[inv.lloji].nr += 1;
        }
    });

    // Bilanci: Shitje (+) minus Blerje (−) minus Shpenzim (−)
    const bilanci = stats.Shitje.total - stats.Blerje.total - stats.Shpenzim.total;

    res.json({
        Blerje: stats.Blerje,
        Shitje: stats.Shitje,
        Shpenzim: stats.Shpenzim,
        bilanci: bilanci,
        totalFatura: stats.Blerje.nr + stats.Shitje.nr + stats.Shpenzim.nr
    });
});

// SHFAQ NJË
app.get('/api/invoices/:id', authenticateToken, (req, res) => {
    const db = readDB();
    const inv = db.invoices.find(i => i.id === Number(req.params.id));
    if (!inv) return res.status(404).json({ error: 'Fatura nuk u gjet' });
    res.json(inv);
});

// SHTO
app.post('/api/invoices', authenticateToken, (req, res) => {
    const { nr_fatures, klienti, data, lloji, shuma } = req.body;

    if (!nr_fatures || !klienti || !data || !lloji || shuma === undefined) {
        return res.status(400).json({ error: 'Të gjitha fushat janë të detyrueshme' });
    }

    const db = readDB();

    if (db.invoices.find(i => i.nr_fatures === nr_fatures)) {
        return res.status(400).json({ error: 'Ky numër fatura ekziston' });
    }

    const newInvoice = {
        id: db.nextInvoiceId++,
        nr_fatures,
        klienti,
        data,
        lloji,
        shuma: Number(shuma),
        user_id: req.user.id
    };

    db.invoices.push(newInvoice);
    writeDB(db);

    res.status(201).json(newInvoice);
});

// NDRYSHO
app.put('/api/invoices/:id', authenticateToken, (req, res) => {
    const { nr_fatures, klienti, data, lloji, shuma } = req.body;
    const id = Number(req.params.id);

    const db = readDB();
    const inv = db.invoices.find(i => i.id === id);

    if (!inv) return res.status(404).json({ error: 'Fatura nuk u gjet' });

    // Kontrollo nëse numri i faturës është i zënë nga një faturë tjetër
    const duplicate = db.invoices.find(i => i.nr_fatures === nr_fatures && i.id !== id);
    if (duplicate) {
        return res.status(400).json({ error: 'Ky numër fatura ekziston' });
    }

    inv.nr_fatures = nr_fatures;
    inv.klienti = klienti;
    inv.data = data;
    inv.lloji = lloji;
    inv.shuma = Number(shuma);

    writeDB(db);
    res.json({ message: 'Fatura u përditësua', invoice: inv });
});

// FSHI
app.delete('/api/invoices/:id', authenticateToken, (req, res) => {
    const id = Number(req.params.id);
    const db = readDB();

    const index = db.invoices.findIndex(i => i.id === id);
    if (index === -1) return res.status(404).json({ error: 'Fatura nuk u gjet' });

    db.invoices.splice(index, 1);
    writeDB(db);

    res.json({ message: 'Fatura u fshi' });
});

// ============ USERAT (vetëm admin) ============
app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Vetëm admin ka akses' });
    }

    const db = readDB();

    const usersSafe = db.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role
    }));

    res.json(usersSafe);
});


// ============ START ============
app.listen(PORT, () => {
    console.log(`🚀 e hostune lokalisht ne: http://localhost:${PORT}`);
    console.log(`🔑 Hapja permes browserit: http://localhost:${PORT}/login.html`);
    console.log(`👤 By: Sahit Bytyqi`);
});