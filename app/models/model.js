const db	= require('../connection');
const async	= require('async');
const _		= require('lodash');

class Model {
	constructor(tableName, fillable, required, preserved, hidden, ascertain, ...opts) {
		this.tableName  = tableName;
		this.fillable   = fillable;
		this.required   = required;
		this.preserved  = preserved;
		this.hidden		= _.assign({}, _.zipObject(hidden, _.times(hidden.length, _.constant(0))), { created_at: 0, updated_at: 0 });
		this.ascertain	= ascertain;
	}

	insertOne(data, callback) {
		const missing   = _.difference(this.required, _.chain(data).pickBy((o) => (!_.isEmpty(o))).keys().value());
		if (missing.length === 0) {
			async.mapValues(_.pickBy(this.ascertain, (o, key) => (_.includes(_.keys(data), key))), (tableTarget, dataKey, filterCallback) => {
				if (_.isArray(data[dataKey])) {
					async.filter(_.uniq(data[dataKey]), (val, next) => {
						db.getCollection(tableTarget).findOne({ _id: db.toObjectID(val), deleted_at: { $exists: false } }, (err, result) => {
							next(null, !_.isNull(result));
						});
					}, (err, filtered) => {
						filterCallback(null, filtered);
					});
				} else {
					db.getCollection(tableTarget).findOne({ _id: db.toObjectID(data[dataKey]), deleted_at: { $exists: false } }, (err, result) => {
						filterCallback(null, !_.isNil(result) ? data[dataKey] : null);
					});
				}
			}, (err, results) => {
				if (err) { return callback(err); }

				const filtered = _.chain(results).pickBy((o) => (_.isNil(o) || _.isEmpty(o))).keys().intersection(this.required).value();
				if (filtered.length > 0) {
					callback('Missing required field(s) : {' + filtered.join(', ') + '}.');
				} else {
					const dates = { created_at: new Date(), updated_at: new Date() };
					db.getCollection(this.tableName).insertOne(_.assign({}, _.pick(data, this.fillable), results, dates), (err, result) => {
						if (err) { return callback(err); }
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
				if (err) { return callback(err); }
				callback(null, { status: result.insertedCount + ' data inserted.', _ids: result.insertedIds });
			});
		} else {
			callback('All data invalid, please check again.');
		}
	}

	find(id, callback) {
		db.getCollection(this.tableName).findOne({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, this.hidden, (err, result) => {
			if (err) { return callback(err); }
			callback(null, result);
		});
	}

	findOne(query, callback) {
		db.getCollection(this.tableName).findOne(_.assign({}, query, { deleted_at: { $exists: false } }), this.hidden, (err, result) => {
			if (err) { return callback(err); }
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
		db.getCollection(this.tableName).findOne({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, (err, result) => {
			if (err) { return callback(err); }
			if (_.isNil(result)) { return callback(this.tableName + ' with id ' + id + ' not found.'); }

			let cherry    = _.pickBy(update, (o, key) => (_.chain(this.fillable).difference(this.preserved).includes(key).value() && !_.isEmpty(o)));
			if (!_.isEmpty(cherry)) {
				async.mapValues(_.pickBy(this.ascertain, (o, key) => (_.includes(_.keys(cherry), key))), (tableTarget, dataKey, filterCallback) => {
					if (_.isArray(cherry[dataKey])) {
						async.filter(_.uniq(cherry[dataKey]), (val, next) => {
							db.getCollection(tableTarget).findOne({ _id: db.toObjectID(val), deleted_at: { $exists: false } }, (err, result) => {
								next(null, !_.isNull(result));
							});
						}, (err, filtered) => {
							filterCallback(null, filtered);
						});
					} else {
						db.getCollection(tableTarget).findOne({ _id: db.toObjectID(cherry[dataKey]), deleted_at: { $exists: false } }, (err, result) => {
							filterCallback(null, !_.isNil(result) ? cherry[dataKey] : null);
						});
					}
				}, (err, results) => {
					if (err) { return callback(err); }

					const ommited	= _.chain(results).pickBy((o) => (_.isNil(o) || _.isEmpty(o))).keys().value();
					cherry	= _.chain(cherry).assign(results).omit(ommited).value();
					db.getCollection(this.tableName).findOneAndUpdate({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, { $set: _.assign({}, cherry, { updated_at: new Date() })}, (err, result) => {
						if (err) { return callback(err); }

						callback(null, _.keys(cherry));
					});
				});
			} else {
				callback(null, []);
			}
		});
	}

	delete(id, callback) {
		db.getCollection(this.tableName).findOneAndUpdate({ _id: db.toObjectID(id), deleted_at: { $exists: false }}, { $set: { deleted_at: new Date() } }, (err, result) => {
			if (err) { return callback(err); }
			callback(null, result.value);
		});
	}

}

module.exports = Model;
