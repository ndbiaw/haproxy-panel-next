import dotenv from 'dotenv';
await dotenv.config({ path: '.env' });

import * as db from './db.js';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';

async function reset() {
	await db.connect();
	const numAccounts = await db.db().collection('accounts').countDocuments();
	const randomPassword = randomBytes(20).toString('base64');
	console.log(randomPassword);
	const passwordHash = await bcrypt.hash(randomPassword, 12);
	if (numAccounts === 0) {
		await db.db().collection('accounts')
			.insertOne({
				_id: 'admin',
				passwordHash: passwordHash,
				domains: ['localhost'],
				balance: 0,
				onboarding: null,
				allowedTemplates: ['basic', 'nocogent']
			});
	} else {
		await db.db().collection('accounts')
			.updateOne({
				_id: 'admin'
			}, {
				$set: {
					passwordHash,
				}
			});
	}
	db.client().close();
}

reset();
