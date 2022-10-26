const db = require('../db.js');
const { validClustersString, makeArrayIfSingle, extractMap, dynamicResponse } = require('../util.js');

exports.clustersPage = async (app, req, res, next) => {
	return app.render(req, res, '/clusters', {
		csrf: req.csrfToken(),
	});
};

exports.clustersJson = async (req, res, next) => {
	return res.json({
		csrf: req.csrfToken(),
		user: res.locals.user,
	});
}

/**
 * POST /global/toggle
 * toggle global ACL
 */
exports.globalToggle = async (req, res, next) => {
	if (res.locals.user.username !== "admin") {
		res.status(403).send('only admin can toggle global');
	}
	let globalIndex;
	try {
		await res.locals.haproxy
			.showAcl()
			.then(list => {
				const hdrCntAcl = list.find(x => x.includes("acl 'hdr_cnt'"));
				if (hdrCntAcl != null) {
					globalIndex = hdrCntAcl.split(' ')[0];
				}
			});
		const globalAcl = await res.locals.haproxy
			.showAcl(globalIndex);
		if (globalAcl.length === 1 && globalAcl[0].endsWith(0)) {
			await res.locals.haproxy
				.clearAcl(globalIndex);
		} else {
			await res.locals.haproxy
				.addAcl(globalIndex, '0');
		}
	} catch (e) {
		return next(e);
	}
	return dynamicResponse(req, res, 302, { redirect: '/account' });
};

/**
 * POST /cluster
 * set active cluster
 */
exports.setCluster = async (req, res, next) => {
	if (res.locals.user.username !== "admin") {
		return dynamicResponse(req, res, 403, { error: 'Only admin can change cluster' });
	}
	if (req.body == null || req.body.cluster == null) {
		return dynamicResponse(req, res, 404, { error: 'Invalid cluster' });
	}
	req.body.cluster = parseInt(req.body.cluster, 10) || 0;
	if (!Number.isSafeInteger(req.body.cluster)
		|| req.body.cluster > res.locals.user.clusters.length-1) {
		return dynamicResponse(req, res, 404, { error: 'Invalid cluster' });
	}
	try {
		await db.db.collection('accounts')
			.updateOne({_id: res.locals.user.username}, {$set: {activeCluster: req.body.cluster }});
	} catch (e) {
		return next(e);
	}
	return dynamicResponse(req, res, 302, { redirect: '/account' });
};

/**
 * POST /cluster/add
 * add cluster
 */
exports.addCluster = async (req, res, next) => {
	if (res.locals.user.username !== "admin") {
		return dynamicResponse(req, res, 404, { error: 'Only admin can add cluster' });
	}
	if (!req.body || !req.body.cluster
		|| typeof req.body.cluster !== 'string'
		|| !validClustersString(req.body.cluster)) {
		return dynamicResponse(req, res, 400, { error: 'Invalid cluster' });
	}
	try {
		await db.db.collection('accounts')
			.updateOne({_id: res.locals.user.username}, {$addToSet: {clusters: req.body.cluster }});
	} catch (e) {
		return next(e);
	}
	return dynamicResponse(req, res, 302, { redirect: '/clusters' });
};

/**
 * POST /cluster/delete
 * delete cluster
 */
exports.deleteClusters = async (req, res, next) => {
	if (res.locals.user.username !== "admin") {
		return dynamicResponse(req, res, 404, { error: 'Only admin can delete cluster' });
	}
	const existingClusters = new Set(res.locals.user.clusters);
	req.body.cluster = makeArrayIfSingle(req.body.cluster);
	if (!req.body || !req.body.cluster
		|| !req.body.cluster.some(c => existingClusters.has(c))) {
		return dynamicResponse(req, res, 400, { error: 'Invalid cluster' });
	}
	const filteredClusters = res.locals.user.clusters.filter(c => !req.body.cluster.includes(c));
	if (filteredClusters.length === 0) {
		return dynamicResponse(req, res, 400, { error: 'Cannot delete last cluster' });
	}
	let newActiveCluster = res.locals.user.activeCluster;
	if (res.locals.user.activeCluster > filteredClusters.length-1) {
		newActiveCluster = 0;
	}
	try {
		await db.db.collection('accounts')
			.updateOne({_id: res.locals.user.username}, {$set: {clusters: filteredClusters, activeCluster: newActiveCluster }});
	} catch (e) {
		return next(e);
	}
	return dynamicResponse(req, res, 302, { redirect: '/clusters' });
};
