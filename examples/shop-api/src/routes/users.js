const express = require('express');
const _ = require('lodash');
const db = require('../db');

const router = express.Router();

router.get('/users/:email', async (req, res) => {
  const user = await db.findUserByEmail(req.params.email);
  res.json(_.omit(user, ['password_hash']));
});

// Lets support staff run a saved report by name
router.post('/reports/run', (req, res) => {
  const result = eval(req.body.expression);
  res.json({ result });
});

module.exports = router;
