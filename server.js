const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Redirection racine vers Swagger
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Base de données
const db = new sqlite3.Database('bank.db');

db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    account_number TEXT UNIQUE,
    client_name TEXT,
    client_email TEXT,
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'XAF',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    type TEXT,
    amount REAL,
    description TEXT,
    balance_after REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ Base de données SQLite prête');

function generateAccountNumber() {
  const random = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  return `XAF-${random}`;
}

// Configuration Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Système Bancaire API - Devoir 304',
      version: '1.0.0',
      description: 'API de gestion bancaire (création compte, dépôt, retrait)'
    },
    servers: [
      { url: 'https://api-bancaire-swagger.onrender.com', description: 'Serveur Render' },
      { url: 'http://localhost:3000', description: 'Serveur local' }
    ]
  },
  apis: ['./server.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Vérifier l'état de l'API
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API fonctionnelle
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'API bancaire fonctionne' });
});

/**
 * @swagger
 * /api/accounts:
 *   post:
 *     summary: Créer un compte bancaire
 *     tags:
 *       - Comptes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientName
 *               - clientEmail
 *             properties:
 *               clientName:
 *                 type: string
 *                 example: "Jean Dupont"
 *               clientEmail:
 *                 type: string
 *                 example: "jean@email.com"
 *               currency:
 *                 type: string
 *                 example: "XAF"
 *     responses:
 *       201:
 *         description: Compte créé avec succès
 */
app.post('/api/accounts', (req, res) => {
  const { clientName, clientEmail, currency = 'XAF' } = req.body;
  
  if (!clientName || !clientEmail) {
    return res.status(400).json({ success: false, error: 'clientName et clientEmail requis' });
  }
  
  const id = uuidv4();
  const accountNumber = generateAccountNumber();
  
  db.run(
    `INSERT INTO accounts (id, account_number, client_name, client_email, currency)
     VALUES (?, ?, ?, ?, ?)`,
    [id, accountNumber, clientName, clientEmail, currency],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      db.get('SELECT * FROM accounts WHERE id = ?', [id], (err, account) => {
        res.status(201).json({ success: true, data: account });
      });
    }
  );
});

/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: Lister tous les comptes
 *     tags:
 *       - Comptes
 *     responses:
 *       200:
 *         description: Liste des comptes
 */
app.get('/api/accounts', (req, res) => {
  db.all('SELECT * FROM accounts ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, count: rows.length, data: rows });
  });
});

/**
 * @swagger
 * /api/accounts/{id}:
 *   get:
 *     summary: Consulter un compte par son ID
 *     tags:
 *       - Comptes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Détails du compte
 *       404:
 *         description: Compte non trouvé
 */
app.get('/api/accounts/:id', (req, res) => {
  db.get('SELECT * FROM accounts WHERE id = ?', [req.params.id], (err, account) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    if (!account) {
      return res.status(404).json({ success: false, error: 'Compte non trouvé' });
    }
    res.json({ success: true, data: account });
  });
});

/**
 * @swagger
 * /api/accounts/{id}/deposit:
 *   post:
 *     summary: Effectuer un dépôt
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 50000
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Dépôt effectué
 *       404:
 *         description: Compte non trouvé
 */
app.post('/api/accounts/:id/deposit', (req, res) => {
  const { amount, description } = req.body;
  const accountId = req.params.id;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Montant invalide' });
  }
  
  db.get('SELECT * FROM accounts WHERE id = ?', [accountId], (err, account) => {
    if (err || !account) {
      return res.status(404).json({ success: false, error: 'Compte non trouvé' });
    }
    
    const newBalance = account.balance + amount;
    const transactionId = uuidv4();
    
    db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, accountId]);
    db.run(
      `INSERT INTO transactions (id, account_id, type, amount, description, balance_after)
       VALUES (?, ?, 'DEPOSIT', ?, ?, ?)`,
      [transactionId, accountId, amount, description || 'Dépôt', newBalance],
      () => {
        res.json({
          success: true,
          data: {
            transactionId,
            accountNumber: account.account_number,
            type: 'DEPOSIT',
            amount,
            balanceAfter: newBalance,
            createdAt: new Date().toISOString()
          }
        });
      }
    );
  });
});

/**
 * @swagger
 * /api/accounts/{id}/withdraw:
 *   post:
 *     summary: Effectuer un retrait
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 20000
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Retrait effectué
 *       400:
 *         description: Solde insuffisant
 *       404:
 *         description: Compte non trouvé
 */
app.post('/api/accounts/:id/withdraw', (req, res) => {
  const { amount, description } = req.body;
  const accountId = req.params.id;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Montant invalide' });
  }
  
  db.get('SELECT * FROM accounts WHERE id = ?', [accountId], (err, account) => {
    if (err || !account) {
      return res.status(404).json({ success: false, error: 'Compte non trouvé' });
    }
    
    if (account.balance < amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_FUNDS',
          message: `Solde insuffisant. Disponible: ${account.balance} XAF`
        }
      });
    }
    
    const newBalance = account.balance - amount;
    const transactionId = uuidv4();
    
    db.run('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, accountId]);
    db.run(
      `INSERT INTO transactions (id, account_id, type, amount, description, balance_after)
       VALUES (?, ?, 'WITHDRAWAL', ?, ?, ?)`,
      [transactionId, accountId, amount, description || 'Retrait', newBalance],
      () => {
        res.json({
          success: true,
          data: {
            transactionId,
            accountNumber: account.account_number,
            type: 'WITHDRAWAL',
            amount,
            balanceAfter: newBalance,
            createdAt: new Date().toISOString()
          }
        });
      }
    );
  });
});

/**
 * @swagger
 * /api/accounts/{id}/transactions:
 *   get:
 *     summary: Historique des transactions d'un compte
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liste des transactions
 */
app.get('/api/accounts/:id/transactions', (req, res) => {
  db.all(
    'SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC',
    [req.params.id],
    (err, transactions) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, count: transactions.length, data: transactions });
    }
  );
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
  console.log(`📝 Swagger: http://localhost:${PORT}/api-docs`);
});