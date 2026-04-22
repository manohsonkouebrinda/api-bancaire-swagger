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

// ========== BASE DE DONNÉES ==========
const db = new sqlite3.Database('bank.db');

db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    account_number TEXT UNIQUE,
    client_name TEXT,
    client_email TEXT,
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'XAF',
    status TEXT DEFAULT 'ACTIVE',
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

// ========== CONFIGURATION SWAGGER ==========
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Système Bancaire API - Devoir 304',
      version: '1.0.0',
      description: `API de gestion bancaire avec tests intégrés

## 📋 CAS DE TEST MANUELS

### Test 1 : Création de compte
- **Requête**: POST /api/accounts
- **Corps**: {"clientName":"MANOH SONKOUE Brinda","clientEmail":"brinda@email.com","currency":"XAF"}
- **Résultat attendu**: 201, compte créé avec ID

### Test 2 : Dépôt
- **Requête**: POST /api/accounts/{id}/deposit
- **Corps**: {"amount":50000}
- **Résultat attendu**: 200, solde augmenté

### Test 3 : Retrait
- **Requête**: POST /api/accounts/{id}/withdraw
- **Corps**: {"amount":20000}
- **Résultat attendu**: 200, solde diminué

### Test 4 : Solde insuffisant
- **Requête**: POST /api/accounts/{id}/withdraw
- **Corps**: {"amount":100000}
- **Résultat attendu**: 400, "Solde insuffisant"

### Test 5 : Fermeture de compte
- **Requête**: DELETE /api/accounts/{id}
- **Résultat attendu**: 200, "Compte désactivé"

### Test 6 : Liste des comptes
- **Requête**: GET /api/accounts
- **Résultat attendu**: 200, tableau des comptes

### Test 7 : Historique des transactions
- **Requête**: GET /api/accounts/{id}/transactions
- **Résultat attendu**: 200, tableau des transactions`
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

// ========== 1. SANTÉ ==========
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

// ========== 2. CRÉER UN COMPTE ==========
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
 *               clientName: { type: string, example: "MANOH SONKOUE Brinda" }
 *               clientEmail: { type: string, example: "brinda@email.com" }
 *               currency: { type: string, example: "XAF" }
 *     responses:
 *       201:
 *         description: Compte créé avec succès
 *       400:
 *         description: Données manquantes
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

// ========== 3. LISTER LES COMPTES ==========
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

// ========== 4. CONSULTER UN COMPTE ==========
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
 *         schema: { type: string }
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

// ========== 5. DÉPÔT ==========
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
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, example: 50000 }
 *               description: { type: string, example: "Dépôt espèces" }
 *     responses:
 *       200:
 *         description: Dépôt effectué
 *       400:
 *         description: Montant invalide
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

// ========== 6. RETRAIT ==========
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
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, example: 20000 }
 *               description: { type: string, example: "Retrait guichet" }
 *     responses:
 *       200:
 *         description: Retrait effectué
 *       400:
 *         description: Montant invalide ou solde insuffisant
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

// ========== 7. HISTORIQUE ==========
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
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des transactions
 *       404:
 *         description: Compte non trouvé
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

// ========== 8. FERMETURE DE COMPTE ==========
/**
 * @swagger
 * /api/accounts/{id}:
 *   delete:
 *     summary: Fermer/désactiver un compte
 *     tags:
 *       - Comptes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Compte désactivé avec succès
 *       404:
 *         description: Compte non trouvé
 */
app.delete('/api/accounts/:id', (req, res) => {
  const accountId = req.params.id;
  
  db.get('SELECT * FROM accounts WHERE id = ?', [accountId], (err, account) => {
    if (err || !account) {
      return res.status(404).json({ success: false, error: 'Compte non trouvé' });
    }
    
    db.run('UPDATE accounts SET status = "INACTIVE" WHERE id = ?', [accountId]);
    res.json({ success: true, message: 'Compte désactivé avec succès' });
  });
});

// ========== DÉMARRAGE ==========
app.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
  console.log(`📝 Swagger: http://localhost:${PORT}/api-docs`);
});