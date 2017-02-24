const db    = require('../connection');
const async	= require('async');
const _     = require('lodash');

class Model {
	constructor(tableName, fillable, required, preserved, hidden, ascertein, ...opts) {
		this.tableName  = tableName;
		this.fillable   = fillable;
		this.required   = required;
		this.preserved  = preserved;
		this.hidden		= _.assign({}, _.zipObject(hidden, _.times(hidden.length, _.constant(0))), { created_at: 0, updated_at: 0 });
		this.ascertein	= !_.isNil(ascertein) ? _.chain(ascertein).map((o, key) => ({ target: key, value: o })).value() : {};
	}

	insertOne(data, callback) {
		const missing   = _.difference(this.required, _.chain(data).pickBy((o) => (!_.isEmpty(o))).keys().value());
		if (missing.length === 0) {
			async.filter(this.ascertein, (o, callback) => {
				db.getCollection(o.target).findOne({ _id: db.toObjectID(data[o.value]), deleted_at: { $exists: false } }, (err, result) => {
					callback(null, _.isNull(result));
				});
			}, (err, results) => {
				if (err) { return callback(err); }
				if (results.length > 0) {
					callback('Missing required field(s) : {' + _.map(results, 'value').join(', ') + '}.');
				} else {
					const dates = { created_at: new Date(), updated_at: new Date() };
					db.getCollection(this.tableName).insertOne(_.assign({}, _.pick(data, this.fillable), dates), (err, result) => {
						if (err) { callback(err); }
						callback(null, { _id: result.insertedId });
					});
				}
			});
		} else {
			callback('Missing required field(s) : {' + missing.join(', ') + '}.');
		}
	}

	insertMany(data, callback) {
		const dates     = { created_at: new Date(), updated_at: new Date() };
		const filtered  = _.chain(data).filter((o) => (_.difference(this.required, _.keys(o)).length === 0)).map((o) => (_.assign({}, _.pick(o, this.fillable), dates))).value();
		if (filtered.length > 0) {
			db.getCollection(this.tableName).insertMany(filtered, (err, result) => {
				if (err) { callback(err); }
				callback(null, { status: result.insertedCount + ' data inserted.', _ids: result.insertedIds });
			});
		} else {
			callback('All data invalid, please check again.');
		}
	}

	find(id, callback) {
		db.getCollection(this.tableName).findOne({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, this.hidden, (err, result) => {
			if (err) { callback(err); }
			callback(null, result);
		});
	}

	findOne(query, callback) {
		db.getCollection(this.tableName).findOne(_.assign({}, query, { deleted_at: { $exists: false } }), this.hidden, (err, result) => {
			if (err) { callback(err); }
			callback(null, result);
		});
	}

	findAll(query, opts, callback) {
		const skip  = !_.isNil(opts.skip) && _.isInteger(opts.skip)     ? opts.skip     : 0;
		const limit = !_.isNil(opts.limit) && _.isInteger(opts.limit)   ? opts.limit    : 0;
		db.getCollection(this.tableName).find(_.assign({}, query, { deleted_at: { $exists: false } })).skip(skip).limit(limit).project(this.hidden).toArray().then((result) => {
			callback(null, result);
		});
	}

	update(id, update, callback) {
		let cherry    = _.pickBy(update, (o, key) => (_.chain(this.fillable).difference(this.preserved).includes(key).value() && !_.isEmpty(o)));
		if (!_.isEmpty(cherry)) {
			async.filter(_.filter(this.ascertein, (o) => (_.includes(_.keys(cherry), o.value))), (o, callback) => {
				db.getCollection(o.target).findOne({ _id: db.toObjectID(cherry[o.value]), deleted_at: { $exists: false } }, (err, result) => {
					callback(null, _.isNull(result));
				});
			}, (err, results) => {
				if (err) { return callback(err); }
				cherry	= _.omit(cherry, _.map(results, 'value'));
				db.getCollection(this.tableName).findOneAndUpdate({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, { $set: _.assign({}, cherry, { updated_at: new Date() })}, (err, result) => {
					if (err) { callback(err); }
					callback(null, _.keys(cherry));
				});
			});
		} else {
			callback(null, []);
		}
	}

	delete(id, callback) {
		db.getCollection(this.tableName).findOneAndUpdate({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, { $set: { deleted_at: new Date() } }, (err, result) => {
			if (err) { callback(err); }
			callback(null, result.value);
		});
	}

}

module.exports = Model;
