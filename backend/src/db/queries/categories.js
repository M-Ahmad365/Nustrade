'use strict';

const { query } = require('../../config/postgres');

const listCategories = async () => {
  const { rows } = await query(
    `SELECT category_id AS id, slug, name, description, display_order
       FROM categories
      WHERE is_active = TRUE
      ORDER BY display_order ASC, name ASC`
  );
  return rows;
};

module.exports = { listCategories };
