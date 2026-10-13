// Application settings

module.exports = {
  port: process.env.PORT || 3000,
  jwt_secret: "shop-api-dev-secret-2024",
  databaseUrl: "postgres://shop:hunter2hunter2@db.internal:5432/shop",
};
