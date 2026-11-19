// Vendor self-service portal — proxies /api/vendor-portal/* to Backend /api/v1/vendor/*
// The backend enforces the 'vendor' role from the forwarded Keycloak token.
const router = require('express').Router();
const attachProxy = require('../middleware/attachProxy');

router.use(attachProxy);

const handleError = (res, error) => {
  const status = error.response?.status || 500;
  const data = error.response?.data || { success: false, message: error.message };
  res.status(status).json(data);
};

// Catalog lookups for the product form (public store endpoints)
router.get('/catalog/categories', async (req, res) => {
  try {
    res.json(await req.api.get('/api/v1/store/categories'));
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/catalog/brands', async (req, res) => {
  try {
    res.json(await req.api.get('/api/v1/store/brands'));
  } catch (error) {
    handleError(res, error);
  }
});

// Everything else forwards 1:1 to /api/v1/vendor/*
router.all('/*', async (req, res) => {
  try {
    const target = `/api/v1/vendor${req.path}`;
    const method = req.method.toLowerCase();
    const result =
      method === 'get'
        ? await req.api.get(target, req.query)
        : method === 'delete'
          ? await req.api.delete(target)
          : await req.api[method](target, req.body);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
