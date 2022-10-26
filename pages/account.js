import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import MapLink from '../components/MapLink.js';
import LoadingPlaceholder from '../components/LoadingPlaceholder.js';
import ErrorAlert from '../components/ErrorAlert.js';
import ApiCall from '../api.js';
import { useRouter } from 'next/router';

const Account = (props) => {

	const router = useRouter();

	const [accountData, setAccountData] = useState(props);
	const [error, setError] = useState();

    React.useEffect(() => {
    	if (!accountData.user) {
	    	ApiCall('/account.json', 'GET', null, setAccountData, setError, null, router);
	    }
    }, [accountData.user, router]);
	
	const loadingSection = (
		<div className="list-group-item list-group-item-action d-flex align-items-start">
			<LoadingPlaceholder />
		</div>
	);

	let innerData;
	
	if (accountData.user != null) {
	
		const { user, maps, acls, globalAcl, csrf } = accountData;

		// isAdmin for showing global override option
		const isAdmin = user.username === 'admin';

		// Next cluster number for > browse button
		const nextCluster = user.clusters[user.activeCluster+1] ? user.activeCluster+1 : 0

		// Links to each map and bubble/pill for map counts
		const mapLinks = maps.map((map, i) => <MapLink key={i} map={map} />);

		async function switchCluster(e) {
			e.preventDefault();
			await ApiCall('/forms/cluster', 'POST', JSON.stringify({ _csrf: csrf, cluster: nextCluster }), null, setError, 0.5, router);
			await ApiCall('/account.json', 'GET', null, setAccountData, setError, null, router);
		}

		async function toggleGlobal(e) {
			e.preventDefault();
			await ApiCall('/forms/global/toggle', 'POST', JSON.stringify({ _csrf: csrf }), null, setError, 0.5, router);
			await ApiCall('/account.json', 'GET', null, setAccountData, setError, null, router);
		}

		innerData = (
			<>
			
				{/* Global overide */}
				{isAdmin === true && (
					<div className="list-group-item d-flex align-items-center">
						<div className="ms-2 me-auto d-flex align-items-center gap-2">
							<span className="fw-bold">
								Global Override
							</span>
							<form onSubmit={toggleGlobal} action="/forms/global/toggle" method="post">
								<input type="hidden" name="_csrf" value={csrf} />
								<input className="btn btn-sm btn-primary" type="submit" value="Toggle" />
							</form>
						</div>
						<div className={`badge rounded-pill bg-${globalAcl?'success':'dark'}`}>
							{globalAcl?'ON':'OFF'}
						</div>
					</div>
				)}
				
				{/* Manage Clusters */}
				<div className="list-group-item list-group-item-action d-flex align-items-start flex-column">
					<div className="flex-row d-flex w-100">
						<div className="ms-2 me-auto">
							<div className="fw-bold">
								Manage Clusters
								<span className="fw-normal">
									{' '}- Add/Delete/Select a cluster
								</span>
							</div>
						</div>
						<span className="ml-auto badge bg-info rounded-pill" style={{ maxHeight: "1.6em" }}>
							Cluster: 1
						</span>
					</div>
					<div className="d-flex w-100 justify-content-between mt-2">
						<div className="ms-2">
							<div className="fw-bold">
								Servers ({user.clusters.length === 0 ? 0 : user.clusters[user.activeCluster].split(',').length})
								{user.clusters.length > 0 && (<span className="fw-normal">
									: {user.clusters[user.activeCluster].split(',').map(x => x.substring(0, x.length/2)+'...').join(', ')}
								</span>)}
							</div>
						</div>
						<span className="ml-auto d-flex flex-row">
							<form onSubmit={switchCluster} action="/forms/cluster" method="post">
								<input type="hidden" name="_csrf" value={csrf}/>
								<input type="hidden" name="cluster" value={nextCluster}/>
								<input className="btn btn-primary px-2 py-0" type="submit" value="&gt;"/>
							</form>
							<Link href="/clusters">
								<a className="btn btn-success px-2 py-0 ms-2" style={{ maxHeight: "1.6em" }}>
									+
								</a>
							</Link>
						</span>
					</div>
				</div>
				
				{/* Available domains */}
				<Link href="/domains">
					<a className="list-group-item list-group-item-action d-flex align-items-start">
						<div className="ms-2 me-auto">
							<div className="fw-bold">
								Available Domains
								<span className="fw-normal">
									{' '}- Domains you have permission over
								</span>
							</div>
						</div>
						<div className="badge bg-primary rounded-pill">
							{user.domains.length}
						</div>
					</a>
				</Link>
				
				{/* Map links */}
				{mapLinks}
				
			</>
		);

	} else {

	
		innerData = (
			<>
				{Array(9).fill(loadingSection)}			
			</>			
		);
		
	}

	return (
		<>
			
			<Head>
				<title>Account</title>
			</Head>

			{error && <ErrorAlert error={error} />}

			<h5 className="fw-bold">
				Controls:
			</h5>
			
			<div className="list-group">

			{innerData}
				
			</div>
			
		</>
	)
};

export async function getServerSideProps({ req, res, query, resolvedUrl, locale, locales, defaultLocale}) {
	return { props: { user: res.locals.user || null, ...query } }
}

export default Account;
