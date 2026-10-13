const express = require('express');
const config = require('./config');
const users = require('./routes/users');

const app = express();
app.use(express.json());
app.use(users);

app.listen(config.port, () => {
  console.log(`shop-api listening on ${config.port}`);
});
