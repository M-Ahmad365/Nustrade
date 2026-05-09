'use strict';

const { Router } = require('express');
const { ok }     = require('../utils/response');
const queries    = require('../db/queries/categories');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const categories = await queries.listCategories();
    return ok(res, { categories });
  } catch (err) {
    return next(err);
  }
});

module.exports = { router };
