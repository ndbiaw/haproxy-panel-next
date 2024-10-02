import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import BackButton from '../components/BackButton.js';
import ErrorAlert from '../components/ErrorAlert.js';
import PaymentModal from '../components/PaymentModal.js';
import { allowedCryptos } from '../util.js';
import * as API from '../api.js';
import { useRouter } from 'next/router';

const statusColors = {
	'cancelled': 'secondary',
	'pending': 'primary',
	'paid': 'success',
	'unpaid': 'warning',
	'overdue': 'danger',
	'other': 'info',
};

export default function Billing(props) {
	const router = useRouter();
	const [state, dispatch] = useState(props || {});
	const [error, setError] = useState();
	const [paymentInfo, setPaymentInfo] = useState(null);
	const [selectedInvoice, setSelectedInvoice] = useState(null);
	const [qrCodeText, setQrCodeText] = useState(null);
	const [selectedCrypto, setSelectedCrypto] = useState({});

	useEffect(() => {
		if (!state.invoices) {
			API.getBilling(dispatch, setError, router, false);
		}
	}, []);

	// auto refresh invoices
	useEffect(() => {
		const interval = setInterval(() => {
			API.getBilling(dispatch, setError, router, false); // false for no progress bar
		}, 10000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (selectedInvoice) {
			const matchingSelectedInvoice = state.invoices
				.find(i => i._id.toString() === selectedInvoice._id.toString());
			if (matchingSelectedInvoice) {
				setSelectedInvoice(matchingSelectedInvoice);
			}
		}
	}, [state.invoices]);

	if (!state.invoices) {
		return (
			<div className='d-flex flex-column'>
				{error && <ErrorAlert error={error} />}
				<div className='text-center mb-4'>
					<div className='spinner-border mt-5' role='status'>
						<span className='visually-hidden'>Loading...</span>
					</div>
				</div>
			</div>
		);
	}

	const { invoices, csrf } = state;

	function handlePayClick(invoice) {
		const crypto = selectedCrypto[invoice._id] || invoice?.paymentData?.crypto;
		API.createPaymentRequest({
			_csrf: csrf,
			invoiceId: invoice._id,
			crypto
		}, (data) => {
			setPaymentInfo(data.shkeeperResponse);
			setQrCodeText(data.qrCodeText);
			setSelectedInvoice(invoice);
		}, setError, router);
	}

	const handleCryptoChange = (invoiceId, crypto) => {
		setSelectedCrypto((prev) => ({ ...prev, [invoiceId]: crypto }));
	};

	return (
		<>
			<Head>
				<title>Billing</title>
			</Head>

			<h5 className='fw-bold'>
				Invoices:
			</h5>

			{/* Invoices table */}
			<div className='table-responsive round-shadow'>
				<table className='table text-nowrap'>
					<tbody>
						<tr className='align-middle'>
							<th>Description</th>
							<th>Date</th>
							<th>Amount</th>
							<th>Status</th>
							<th>Action</th>
						</tr>
						{invoices.map((inv) => (
							<tr key={inv._id} className='align-middle'>
								<td>{inv.description}</td>
								<td suppressHydrationWarning={true}>
									{new Date(inv.date).toLocaleString()}
								</td>
								<td>${(inv.amount / 100).toFixed(2)}</td>
								<td>
									<span className={`badge rounded-pill text-bg-${statusColors[inv.status]} text-uppercase`}>
										{inv.status}
									</span>
								</td>
								<td>
									<div className='d-flex gap-2'>
										{inv?.paymentData?.paid !== true ? (
											//dropdown and pay button for unpaid invoices
											<>
												<select
													className='form-select form-select-sm'
													onChange={(e) => handleCryptoChange(inv._id, e.target.value)}
													value={inv?.paymentData?.crypto || selectedCrypto[inv._id] || ''}
													disabled={inv.status === 'paid' || inv?.paymentData?.crypto}
													required
												>
													<option value='' disabled>Select crypto</option>
													{allowedCryptos.map((crypto) => (
														<option key={crypto} value={crypto}>{crypto}</option>
													))}
												</select>
												<button
													className='btn btn-success btn-sm'
													onClick={() => handlePayClick(inv)}
												>
													Pay
												</button>
											</>
										) : (
											//view button for paid invoices
											<button
												className='btn btn-primary btn-sm'
												onClick={() => handlePayClick(inv)}
											>
												View
											</button>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{error && <span className='mx-2'><ErrorAlert error={error} /></span>}

			{/* Payment Information Modal */}
			{paymentInfo && <PaymentModal
				setPaymentInfo={setPaymentInfo}
				setQrCodeText={setQrCodeText}
				qrCodeText={qrCodeText}
				paymentInfo={paymentInfo}
				selectedInvoice={selectedInvoice}
			/>}

			{/* Back to account */}
			<BackButton to='/account' />
		</>
	);
}

export async function getServerSideProps({ _req, res, _query, _resolvedUrl, _locale, _locales, _defaultLocale }) {
	return { props: JSON.parse(JSON.stringify(res.locals.data)) };
}
