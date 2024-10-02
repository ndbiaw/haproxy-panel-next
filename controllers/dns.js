import * as db from '../db.js';
import * as redis from '../redis.js';
import { parse } from 'ip6addr';
import { isIPv4, isIPv6 } from 'node:net';
import { dynamicResponse } from '../util.js';
import { getAllTemplateIps, nsTemplate, soaTemplate, aTemplate, aaaaTemplate } from '../templates.js';

/**
* GET /dns/:domain
* domains records page
*/
export async function dnsDomainPage(app, req, res) {
	if (!res.locals.user.domains.includes(req.params.domain)) {
		return dynamicResponse(req, res, 302, { redirect: '/domains' });
	}
	const recordSetsRaw = await redis.hgetall(`dns:${req.params.domain}.`);
	const recordSets = recordSetsRaw && Object.keys(recordSetsRaw)
		.map(k => {
			return { [k]: JSON.parse(recordSetsRaw[k]) };
		}) || [];
	res.locals.data = {
		user: res.locals.user,
		csrf: req.csrfToken(),
		recordSets,
	};
	return app.render(req, res, `/dns/${req.params.domain}`);
};

/**
* GET /dns/:domain/:zone/:type
* record set page
*/
export async function dnsRecordPage(app, req, res) {
	if (!res.locals.user.domains.includes(req.params.domain)) {
		return dynamicResponse(req, res, 302, { redirect: '/domains' });
	}
	let recordSet = [];
	if (req.params.zone && req.params.type) {
		let recordSetRaw = await redis.hget(`dns:${req.params.domain}.`, req.params.zone);
		if (!recordSetRaw) {
			recordSetRaw = {};
		}
		recordSet = recordSetRaw[req.params.type];
		recordSet = Array.isArray(recordSet) ? recordSet : (recordSet ? [recordSet] : []);
	}
	res.locals.data = {
		user: res.locals.user,
		csrf: req.csrfToken(),
		recordSet,
	};
	return app.render(req, res, `/dns/${req.params.domain}/${req.params.zone||'name'}/${req.params.type||'a'}`);
};

/**
* GET /dns/:domain.json
* domain record json
*/
export async function dnsDomainJson(req, res) {
	if (!res.locals.user.domains.includes(req.params.domain)) {
		return dynamicResponse(req, res, 403, { error: 'No permission for this domain' });
	}
	const recordSetsRaw = await redis.hgetall(`dns:${req.params.domain}.`);
	const recordSets = recordSetsRaw && Object.keys(recordSetsRaw)
		.map(k => {
			return { [k]: JSON.parse(recordSetsRaw[k]) };
		}) || [];
	return res.json({
		csrf: req.csrfToken(),
		user: res.locals.user,
		recordSets,
	});
};

/**
* GET /dns/:domain/:zone/:type.json
* record set json
*/
export async function dnsRecordJson(req, res) {
	if (!res.locals.user.domains.includes(req.params.domain)) {
		return dynamicResponse(req, res, 403, { error: 'No permission for this domain' });
	}
	let recordSet = [];
	if (req.params.zone && req.params.type) {
		let recordSetRaw = await redis.hget(`dns:${req.params.domain}.`, req.params.zone);
		if (!recordSetRaw) {
			recordSetRaw = {};
		}
		recordSet = recordSetRaw[req.params.type];
		recordSet = Array.isArray(recordSet) ? recordSet : (recordSet ? [recordSet] : []);
	}
	return res.json({
		csrf: req.csrfToken(),
		user: res.locals.user,
		recordSet,
	});
};

/**
* POST /post/:domain/:zone/:type/delete
* delete record
*/
export async function dnsRecordDelete(req, res) {
	if (!res.locals.user.domains.includes(req.params.domain)) {
		return dynamicResponse(req, res, 302, { redirect: '/domains' });
	}
	if (req.params.zone && req.params.type) {
		let recordSetRaw = await redis.hget(`dns:${req.params.domain}.`, req.params.zone);
		if (!recordSetRaw) {
			recordSetRaw = {};
		}
		delete recordSetRaw[req.params.type];
		if (Object.keys(recordSetRaw).length === 0) {
			await redis.hdel(`dns:${req.params.domain}.`, req.params.zone);
		} else {
			await redis.hset(`dns:${req.params.domain}.`, req.params.zone, recordSetRaw);
		}
	}
	return dynamicResponse(req, res, 302, { redirect: `/dns/${req.params.domain}` });
};

/**
* POST /post/:domain/:zone/:type
* add/update record
*/
export async function dnsRecordUpdate(req, res) {
	if (!res.locals.user.domains.includes(req.params.domain)) {
		return dynamicResponse(req, res, 403, { error: 'No permission for this domain' });
	}
	/*if (Object.values(req.body).some(v => typeof v !== "string")) {
		return dynamicResponse(req, res, 400, { error: 'Invalid input' });
	}*/
	let { ttl } = req.body;
	let { domain, zone, type } = req.params;
	let records = [];
	let template = type.includes('_template');
	if (template) {
		//handle template types separately
		switch (true) {
			case type === 'a_template' || type.startsWith('a_template:'): {
				//extract template name from the value
				const [_, templateName] = type.split(':');
				if (templateName && !res.locals.user.allowedTemplates.includes(templateName)) {
					//permission check, only certain users can access non default template
					return dynamicResponse(req, res, 403, { error: 'You don\'t have permission to use this template type' });
				}
				records = JSON.parse(JSON.stringify((await aTemplate(templateName))));
				template = true;
				type = 'a';
				break;
			}
			case type === 'aaaa_template' || type.startsWith('aaaa_template:'): {
				const [_, templateName] = type.split(':');
				if (templateName && !res.locals.user.allowedTemplates.includes(templateName)) {
					return dynamicResponse(req, res, 403, { error: 'You don\'t have permission to use this template type' });
				}
				records = JSON.parse(JSON.stringify((await aaaaTemplate(templateName))));
				template = true;
				type = 'aaaa';
				break;
			}
			case type === 'ns_template':
				records = JSON.parse(JSON.stringify(nsTemplate()));
				template = true;
				type = 'ns';
				break;
			case type === 'soa_template':
				records = JSON.parse(JSON.stringify(soaTemplate()));
				records[0].MBox = `root.${req.params.domain}.`;
				template = true;
				type = 'soa';
				break;
			default:
				return dynamicResponse(req, res, 400, { error: 'Invalid input' });
		}
	} else {
		//TODO: not required the "all" ones
		const allAs = await getAllTemplateIps('a');
		const allowedAIps = await getAllTemplateIps('a', res.locals.user.allowedTemplates);
		const allAAAAs = (await getAllTemplateIps('aaaa'))
			.map(x => parse(x).toString({ zeroElide: false, zeroPad:false })); // prevent bypass with compressed addresses
		const allowedAAAAIps = (await getAllTemplateIps('aaaa', res.locals.user.allowedTemplates))
			.map(x => parse(x).toString({ zeroElide: false, zeroPad:false })); // prevent bypass with compressed addresses
		switch (type) {
			default: {
				for (let i = 0; i < (type == 'soa' ? 1 : 100); i++) {
					let {
						[`value_${i}`]: value,
						//geo
						[`geok_${i}`]: geok,
						[`geov_${i}`]: geov,
						[`preference_${i}`]: preference,
						[`port_${i}`]: port,
						//health
						[`id_${i}`]: id,
						[`health_${i}`]: h,
						[`fallbacks_${i}`]: fb,
						[`sel_${i}`]: sel,
						[`bsel_${i}`]: bsel,
						//other (numbers)
						[`weight_${i}`]: weight,
						[`priority_${i}`]: priority,
						[`flag_${i}`]: flag,
						[`refresh_${i}`]: refresh,
						[`retry_${i}`]: retry,
						[`expire_${i}`]: expire,
						//other
						[`tag_${i}`]: tag,
						[`mbox_${i}`]: MBox,
						//closest
						[`c_${i}`]: closest,
						[`lat_${i}`]: lat,
						[`long_${i}`]: long,
					} = req.body;
					if (!value) { break; }
					try {
						if ((geok && !['cn', 'cc'].includes(geok))
							|| (sel && !['0', '1', '2', '3'].includes(sel))
							|| (bsel && !['0', '1', '2', '3', '4', '5', '6'].includes(bsel))
							|| (flag && (isNaN(flag) || parseInt(flag) !== +flag))
							|| (ttl && (isNaN(ttl) || parseInt(ttl) !== +ttl))
							|| (preference && (isNaN(preference) || parseInt(preference) !== +preference))
							|| (port && (isNaN(port) || parseInt(port) !== +port))
							|| (weight && (isNaN(weight) || parseInt(weight) !== +weight))
							|| (priority && (isNaN(priority) || parseInt(priority) !== +priority))
							|| (refresh && (isNaN(refresh) || parseInt(refresh) !== +refresh))
							|| (retry && (isNaN(retry) || parseInt(retry) !== +retry))
							|| (expire && (isNaN(expire) || parseInt(expire) !== +expire))
							|| (lat && isNaN(lat))
							|| (long && isNaN(long))
							|| (geov && !Array.isArray(geov))
							|| (fb && !Array.isArray(fb))) {
							return dynamicResponse(req, res, 400, { error: 'Invalid input' });
						}
						flag && (flag = parseInt(flag));
						ttl && (ttl = parseInt(ttl));
						preference && (preference = parseInt(preference));
						port && (port = parseInt(port));
						weight && (weight = parseInt(weight));
						priority && (priority = parseInt(priority));
						refresh && (refresh = parseInt(refresh));
						retry && (retry = parseInt(retry));
						expire && (expire = parseInt(expire));
						sel && (sel = parseInt(sel));
						bsel && (bsel = parseInt(bsel));
						h && (h = (h != null ? true : false));
						closest != null && (closest = true);
						lat && (lat = parseFloat(lat));
						long && (long = parseFloat(long));
						geov && (geov = geov.map(x => x.trim()).slice(0,300)); //todo: country/continent filter
						fb && (fb = fb.map(x => x.trim()).slice(0,20));
					} catch(e) {
						console.error(e);
						return dynamicResponse(req, res, 400, { error: 'Invalid input' });
					}
					let record;
					switch(type) {
						case 'a': {
							if (!isIPv4(value)) {
								return dynamicResponse(req, res, 400, { error: 'Invalid input' });
							}
							//Prevent manually inputting IPs from templates you dont have access to
							if (allAs.includes(value)
								&& !allowedAIps.includes(value)) {
								return dynamicResponse(req, res, 400, { error: 'Restricted IP, please contact support' });
							}
							record = { ttl, id, ip: value, geok, geov, h, sel, bsel, fb, u: true, closest, lat, long };
							break;
						}
						case 'aaaa': {
							if (!isIPv6(value)) {
								return dynamicResponse(req, res, 400, { error: 'Invalid input' });
							}
							const parsedIpv6 = parse(value).toString({ zeroElide: false, zeroPad:false });
							if (allAAAAs.includes(parsedIpv6)
								&& !allowedAAAAIps.includes(parsedIpv6)) {
								return dynamicResponse(req, res, 400, { error: 'Restricted IP, please contact support' });
							}
							record = { ttl, id, ip: value, geok, geov, h, sel, bsel, fb, u: true, closest, lat, long };
							break;
						}
						case 'txt':
							record = { ttl, text: value };
							break;
						case 'cname':
						case 'ns':
							record = { ttl, host: value };
							break;
						case 'mx':
							record = { ttl, host: value, preference };
							break;
						case 'srv':
							record = { ttl, target: value, port, weight, priority };
							break;
						case 'caa':
							record = { ttl, value, flag, tag };
							break;
						case 'soa':
							record = { ttl, ns: value, MBox, refresh, retry, expire, minttl: 180 };
							break;
						default:
							return dynamicResponse(req, res, 400, { error: 'Invalid input' });
					}
					records.push(record);
				}
			}
		}
	}
	if (records.lencth === 0) {
		return dynamicResponse(req, res, 400, { error: 'Invalid input' });
	}
	let recordSetRaw = await redis.hget(`dns:${req.params.domain}.`, req.params.zone);
	let originalTemplateName; //take template name from redis
	if (!recordSetRaw) {
		recordSetRaw = {};
	} else if (recordSetRaw[type] && recordSetRaw[type].l === true //single check for SOAs
		|| (Array.isArray(recordSetRaw[type]) && (recordSetRaw[type].length > 0 && recordSetRaw[type][0].l === true))) { //array check for others
		return dynamicResponse(req, res, 400, { error: 'You can\'t edit or overwrite locked records' });
	}
	if (Array.isArray(recordSetRaw[type]) && recordSetRaw[type].length > 0 && recordSetRaw[type][0].tn) {
		originalTemplateName = recordSetRaw[type][0].tn;
		console.log('found original template name (.tn):', originalTemplateName);
	}
	if (type == 'soa') {
		template = template
			|| (recordSetRaw[type] && recordSetRaw[type]['t'] === true);
		recordSetRaw[type] = records[0];
		recordSetRaw[type]['t'] = template;
	} else {
		template = template
			|| (recordSetRaw[type] && recordSetRaw[type].length > 0 && recordSetRaw[type][0]['t'] === true);
		recordSetRaw[type] = records;
		recordSetRaw[type].forEach(rr => rr['t'] = template);
		if (originalTemplateName) {
			//maintain original template name even when editing a template
			recordSetRaw[type].forEach(rr => rr['tn'] = originalTemplateName);
		}
	}
	await redis.hset(`dns:${domain}.`, zone, recordSetRaw);
	return dynamicResponse(req, res, 302, { redirect: `/dns/${domain}` });
};

/**
* GET /down
* downed ips page
*/
export async function downPage(app, req, res) {
	if (!res.locals.user.username === 'admin') {
		return dynamicResponse(req, res, 302, { redirect: '/account' });
	}
	const ipsRecord = await db.db().collection('down').findOne({ _id: 'down' });
	res.locals.data = {
		user: res.locals.user,
		csrf: req.csrfToken(),
		ips: ipsRecord ? ipsRecord.ips : [],
	};
	return app.render(req, res, '/down');
};

/**
* GET /down.json
* downed ips json
*/
export async function downJson(req, res) {
	if (!res.locals.user.username === 'admin') {
		return dynamicResponse(req, res, 403, { error: 'No permission' });
	}
	const ipsRecord = await db.db().collection('down').findOne({ _id: 'down' });
	return res.json({
		csrf: req.csrfToken(),
		user: res.locals.user,
		ips: ipsRecord ? ipsRecord.ips : [],
	});
};
