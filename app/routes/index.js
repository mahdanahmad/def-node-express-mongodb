const express	= require('express');

const router	= express.Router();

/* index. */
router.get('/', (req, res, next) => { res.json(); });

module.exports = router;
