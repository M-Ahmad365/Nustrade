'use strict';

const { Router }       = require('express');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const { createSavedSearchSchema } = require('../validators/savedSearches');
const ctrl = require('../controllers/savedSearches');

const router = Router();

router.use(authenticate);

/** GET /api/v1/saved-searches — list my saved searches */
router.get('/', ctrl.getSavedSearches);

/** POST /api/v1/saved-searches — create a saved search */
router.post('/', validate(createSavedSearchSchema), ctrl.createSavedSearch);

/** DELETE /api/v1/saved-searches/:id — delete own saved search */
router.delete('/:id', ctrl.deleteSavedSearch);

module.exports = { router };
