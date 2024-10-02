import url from 'url';

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import QRCode from 'qrcode';

export const createQrCodeText = async (shkeeperResponse, crypto) => {
	const { wallet, amount } = shkeeperResponse;
	let qrCodeURL;

	switch (crypto) {
		case 'BTC':
			qrCodeURL = `bitcoin:${wallet}?amount=${amount}`;
			break;
		case 'LTC':
			qrCodeURL = `litecoin:${wallet}?amount=${amount}`;
			break;
		case 'ETH':
		case 'ETH-USDT':
		case 'ETH-USDC':
			qrCodeURL = `ethereum:${wallet}?value=${amount}`;
			break;
		case 'XMR':
			qrCodeURL = `monero:${wallet}?tx_amount=${amount}`;
			break;
		default:
			qrCodeURL = wallet;
			break;
	}

	const qrCodeText = await QRCode.toDataURL(qrCodeURL);
	return qrCodeText;
};

export const allowedCryptos = (process.env.NEXT_PUBLIC_ALLOWED_CRYPTOS||'')
	.split(',')
	.map(x => x.trim());

const fMap = {
	[process.env.HOSTS_MAP_NAME]: {
		fname: 'Backends',
		description: 'Backend IP mappings for domains',
		columnNames: ['Domain', 'Backend'],
	},

	[process.env.DDOS_MAP_NAME]: {
		fname: 'Protection Rules',
		description: 'Set protection modes on domains and/or paths',
		columnNames: ['Domain/Path', 'Mode', 'Tor Exits Only'],
		columnKeys: ['m', 't'],
	},

	[process.env.DDOS_CONFIG_MAP_NAME]: {
		fname: 'Protection Settings',
		description: 'Customise protection settings on a per-domain basis',
		columnNames: [
			'Domain/Path',
			'Difficulty',
			'POW Type',
			'Expiry',
			'Lock cookie to IP',
		],
		columnKeys: ['pd', 'pt', 'cex', 'cip'],
	},

	[process.env.BLOCKED_IP_MAP_NAME]: {
		fname: 'IP Blacklist',
		description: 'IPs/subnets that are outright blocked',
		columnNames: ['IP/Subnet', 'Note'],
		showAllColumns: true,
	},

	[process.env.BLOCKED_ASN_MAP_NAME]: {
		fname: 'ASN Blacklist',
		description: 'ASNs that are outright blocked',
		columnNames: ['AS Number', 'Note'],
		showAllColumns: true,
	},

	[process.env.BLOCKED_CC_MAP_NAME]: {
		fname: 'Country Blacklist',
		description: 'Countries that are outright blocked',
		columnNames: ['Country Code', 'Note'],
		showAllColumns: true,
	},

	[process.env.BLOCKED_CN_MAP_NAME]: {
		fname: 'Continent Blacklist',
		description: 'Continents that are outright blocked',
		columnNames: ['Continent Code', 'Note'],
		showAllColumns: true,
	},

	[process.env.WHITELIST_MAP_NAME]: {
		fname: 'IP Whitelist',
		description: 'IPs/subnets that bypass protection rules',
		columnNames: ['IP/Subnet', 'Note'],
		showAllColumns: true,
	},

	[process.env.MAINTENANCE_MAP_NAME]: {
		fname: 'Maintenance Mode',
		description: 'Disable proxying and show maintenance page for selected domains',
		columnNames: ['Domain', ''],
	},

	[process.env.REWRITE_MAP_NAME]: {
		fname: 'Rewrites',
		description: 'Rewrite domain to a different domain and/or path',
		columnNames: ['Domain', 'Rewrite to'],
	},

	[process.env.REDIRECT_MAP_NAME]: {
		fname: 'Redirects',
		description: 'Redirect one domain to another, stripping path',
		columnNames: ['Domain', 'Redirect to'],
	},
  // [process.env.BACKENDS_MAP_NAME]: {
  // fname: 'Domain Backend Mappings',
  // description: 'Which internal server haproxy uses for domains',
  // columnNames: ['Domain', 'Server Name'],
  // },
};

export function makeArrayIfSingle(obj) {
	return !Array.isArray(obj) ? [obj] : obj;
}

export function validClustersString(string) {
	return !string.split(',').some((c) => {
		const cUrl = url.parse(c);
		return (cUrl.protocol !== 'http:' || !cUrl.hostname);
	});
}

export function extractMap(item) {
	const name = item.file &&
    item.file.match(/\/etc\/haproxy\/map\/(?<name>.+).map/).groups.name;
	if (!fMap[name]) {return null;}
	const count = item.description &&
    item.description.match(/(?:.+entry_cnt=(?<count>\d+)$)?/).groups.count;
	return {
		name,
		count,
		id: item.id,
		...fMap[name],
	};
}

export function dynamicResponse(req, res, code, data) {
	const isRedirect = code === 302;
	if (req.headers && req.headers['content-type'] === 'application/json') {
		return res
			.status(isRedirect ? 200 : code)
			.json(data);
	}
	if (isRedirect) {
		return res.redirect(data.redirect);
	}
	return res.status(code).send(data);
}

//check if list includes domain of a wildcard
export function wildcardAllowed(domain, allowedDomains) {
	if (domain.includes('\\')) {throw new Error('Illegal wildcardAllowed');}
	const wcRegex = new RegExp(`${domain.replace(/\*\./g, '([^ ]*\\.|^)')}$`);
	return allowedDomains.some((d) => {
		return wcRegex.test(d);
	});
}

//check if a domain matches a wildcard
export function wildcardMatches(domain, wildcard) {
	if (wildcard.includes('\\')) {throw new Error('Illegal wildcardMatches');}
	const wcRegex = new RegExp(`${wildcard.replace(/\*\./g, '^.*\\.')}$`);
	return wcRegex.test(domain);
}

export function getApproxSubject(storageName) {
	let ret = storageName
		.replaceAll('_', '.')
		.substr(0, storageName.length - 4);
	if (ret.startsWith('.')) {
		ret = ret.substring(1);
	}
	return ret;
}

export function filterCertsByDomain(certs, allowedDomains) {
	return certs.filter((c) => {
		const approxSubject = getApproxSubject(c.storage_name);
		return allowedDomains.includes(approxSubject);
	});
}
