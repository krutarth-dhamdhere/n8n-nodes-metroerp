import {
	type IExecuteFunctions,
	type JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

/**
 * Helpers are module-level functions (not class methods).
 * n8n runs execute via `.call(IExecuteFunctions)`, so `this` is not the
 * MetroErp instance — class methods like `this.handleInvoice` are undefined.
 */

async function apiRequest(baseUrl, method, path, body) {
	const options: Record<string, unknown> = {
		method,
		url: `${baseUrl}${path}`,
		headers: {
			// Prefer text/plain to avoid Odoo JSON-RPC routing on application/json
			'Content-Type': 'text/plain',
			Accept: 'application/json',
		},
		json: false,
		encoding: 'utf8',
	};
	if (body !== undefined) {
		options.body = typeof body === 'string' ? body : JSON.stringify(body);
	}

	const response = await this.helpers.httpRequestWithAuthentication.call(
		this,
		'metroErpApi',
		options,
	);

	if (typeof response === 'string') {
		try {
			return JSON.parse(response);
		} catch {
			return { raw: response };
		}
	}
	return response;
}

function toDateOnly(value) {
	if (!value) return undefined;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
	return d.toISOString().slice(0, 10);
}

function parseJsonBody(raw, itemIndex) {
	let body = raw;
	if (typeof body === 'string') {
		const trimmed = body.trim();
		if (!trimmed) {
			throw new NodeOperationError(this.getNode(), 'JSON Body is empty', { itemIndex });
		}
		try {
			body = JSON.parse(trimmed);
		} catch (e) {
			throw new NodeOperationError(
				this.getNode(),
				`JSON Body must be valid JSON: ${e.message}`,
				{ itemIndex },
			);
		}
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new NodeOperationError(
			this.getNode(),
			'JSON Body must evaluate to a JSON object',
			{ itemIndex },
		);
	}
	return body;
}

async function handleContact(baseUrl, operation, itemIndex) {
	if (operation === 'create' || operation === 'update') {
		const useJson = this.getNodeParameter('jsonParameters', itemIndex, false);
		if (useJson) {
			const body = parseJsonBody.call(
				this,
				this.getNodeParameter('bodyJson', itemIndex),
				itemIndex,
			);
			if (operation === 'create') {
				return apiRequest.call(this, baseUrl, 'POST', '/api/n8n/v1/contacts', body);
			}
			const id = this.getNodeParameter('contactId', itemIndex);
			return apiRequest.call(this, baseUrl, 'PUT', `/api/n8n/v1/contacts/${id}`, body);
		}
	}

	if (operation === 'create') {
		const body = {
			name: this.getNodeParameter('name', itemIndex),
			email: this.getNodeParameter('email', itemIndex) || undefined,
			phone: this.getNodeParameter('phone', itemIndex) || undefined,
			uen: this.getNodeParameter('uen', itemIndex) || undefined,
			address: this.getNodeParameter('address', itemIndex) || undefined,
			is_company: this.getNodeParameter('isCompany', itemIndex),
		};
		return apiRequest.call(this, baseUrl, 'POST', '/api/n8n/v1/contacts', body);
	}

	if (operation === 'get') {
		const id = this.getNodeParameter('contactId', itemIndex);
		return apiRequest.call(this, baseUrl, 'GET', `/api/n8n/v1/contacts/${id}`);
	}

	if (operation === 'getAll') {
		const limit = this.getNodeParameter('limit', itemIndex);
		const search = this.getNodeParameter('search', itemIndex);
		const qs = new URLSearchParams({ limit: String(limit) });
		if (search) qs.set('search', search);
		return apiRequest.call(this, baseUrl, 'GET', `/api/n8n/v1/contacts?${qs.toString()}`);
	}

	if (operation === 'update') {
		const id = this.getNodeParameter('contactId', itemIndex);
		const body: Record<string, unknown> = {};
		const name = this.getNodeParameter('name', itemIndex);
		const email = this.getNodeParameter('email', itemIndex);
		const phone = this.getNodeParameter('phone', itemIndex);
		const uen = this.getNodeParameter('uen', itemIndex);
		const address = this.getNodeParameter('address', itemIndex);
		if (name) body.name = name;
		if (email) body.email = email;
		if (phone) body.phone = phone;
		if (uen) body.uen = uen;
		if (address) body.address = address;
		body.is_company = this.getNodeParameter('isCompany', itemIndex);
		return apiRequest.call(this, baseUrl, 'PUT', `/api/n8n/v1/contacts/${id}`, body);
	}

	throw new NodeOperationError(this.getNode(), `Unknown contact operation: ${operation}`, {
		itemIndex,
	});
}

async function handleInvoice(baseUrl, operation, itemIndex, resource) {
	const isBill = resource === 'bill';
	const collectionPath = isBill ? '/api/n8n/v1/bills' : '/api/n8n/v1/invoices';
	if (operation === 'create' || operation === 'update') {
		const useJson = this.getNodeParameter('jsonParameters', itemIndex, false);
		if (useJson) {
			const body = parseJsonBody.call(
				this,
				this.getNodeParameter('bodyJson', itemIndex),
				itemIndex,
			);
			if (operation === 'create') {
				if (!body.line_items || !body.line_items.length) {
					throw new NodeOperationError(
						this.getNode(),
						'JSON Body must include at least one line_items entry',
						{ itemIndex },
					);
				}
				return apiRequest.call(this, baseUrl, 'POST', collectionPath, body);
			}
			const id = this.getNodeParameter('invoiceId', itemIndex);
			return apiRequest.call(this, baseUrl, 'PUT', `${collectionPath}/${id}`, body);
		}

		const lineCollection = this.getNodeParameter('lineItems', itemIndex, {});
		const rawLines = lineCollection.item || [];
		const line_items = rawLines.map((li) => {
			const item: Record<string, unknown> = {
				description: li.description,
				quantity: li.quantity,
				unit_amount: li.unitAmount,
				account_code: li.accountCode || undefined,
				uom: li.uom || undefined,
				product_uom_id: li.productUomId || undefined,
				product_id: li.productId || undefined,
				product_code: li.productCode || undefined,
				discount: li.discount,
				discount_type: li.discountType || undefined,
			};
			if (li.taxIds) {
				const taxes = String(li.taxIds)
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean)
					.map((t) => parseInt(t, 10))
					.filter((n) => !Number.isNaN(n));
				if (taxes.length) item.tax_ids = taxes;
			}
			return item;
		});

		const body: Record<string, unknown> = {
			reference: this.getNodeParameter('reference', itemIndex) || undefined,
			invoice_date: toDateOnly(this.getNodeParameter('invoiceDate', itemIndex)),
			due_date: toDateOnly(this.getNodeParameter('dueDate', itemIndex)),
			currency: this.getNodeParameter('currency', itemIndex) || undefined,
			post: this.getNodeParameter('post', itemIndex),
		};

		if (line_items.length) {
			body.line_items = line_items;
		}

		const partnerId = this.getNodeParameter('partnerId', itemIndex);
		if (partnerId) {
			body.partner_id = parseInt(partnerId, 10);
		}

		if (operation === 'create') {
			if (!isBill) {
				body.type = this.getNodeParameter('invoiceType', itemIndex);
			}
			const contactName = this.getNodeParameter('contactName', itemIndex);
			const contactEmail = this.getNodeParameter('contactEmail', itemIndex);
			if (!partnerId && contactName) {
				const contact: Record<string, unknown> = {
					name: contactName,
					email: contactEmail || undefined,
				};
				if (!isBill) {
					const contactPhone = this.getNodeParameter('contactPhone', itemIndex);
					const contactUen = this.getNodeParameter('contactUen', itemIndex);
					const contactAddress = this.getNodeParameter('contactAddress', itemIndex);
					if (contactPhone) contact.phone = contactPhone;
					if (contactUen) contact.uen = contactUen;
					if (contactAddress) contact.address = contactAddress;
				}
				body.contact = contact;
			}
			const lines = body.line_items as unknown[] | undefined;
			if (!lines || !lines.length) {
				throw new NodeOperationError(this.getNode(), 'At least one line item is required', {
					itemIndex,
				});
			}
			return apiRequest.call(this, baseUrl, 'POST', collectionPath, body);
		}

		const id = this.getNodeParameter('invoiceId', itemIndex);
		return apiRequest.call(this, baseUrl, 'PUT', `${collectionPath}/${id}`, body);
	}

	if (operation === 'get') {
		const id = this.getNodeParameter('invoiceId', itemIndex);
		return apiRequest.call(this, baseUrl, 'GET', `${collectionPath}/${id}`);
	}

	if (operation === 'getAll') {
		const limit = this.getNodeParameter('limit', itemIndex);
		const status = this.getNodeParameter('status', itemIndex);
		const qs = new URLSearchParams({ limit: String(limit) });
		if (!isBill) {
			const invoiceType = this.getNodeParameter('invoiceType', itemIndex);
			if (invoiceType) qs.set('type', invoiceType);
		}
		if (status) qs.set('status', status);
		return apiRequest.call(this, baseUrl, 'GET', `${collectionPath}?${qs.toString()}`);
	}

	throw new NodeOperationError(this.getNode(), `Unknown invoice operation: ${operation}`, {
		itemIndex,
	});
}

const invoiceJsonDefault = `={{
{
  "type": "invoice",
  "contact": {
    "name": $json.customer_name,
    "email": $json.email,
    "phone": $json.phone,
    "uen": $json.uen,
    "address": $json.address
  },
  "reference": $json.reference,
  "currency": $json.currency,
  "post": false,
  "line_items": [
    {
      "description": $json.description,
      "quantity": $json.quantity,
      "unit_amount": $json.unit_amount,
      "uom": $json.uom,
      "discount_type": $json.discount_type || "percent",
      "discount": $json.discount,
      "account_code": $json.account_code,
      "product_code": $json.product_code
    }
  ]
}
}}`;

const billJsonDefault = `={{
{
  "contact": {
    "name": $json.vendor_name,
    "email": $json.email
  },
  "reference": $json.reference,
  "currency": $json.currency,
  "post": false,
  "line_items": [
    {
      "description": $json.description,
      "quantity": $json.quantity,
      "unit_amount": $json.unit_amount,
      "uom": $json.uom,
      "discount_type": $json.discount_type || "percent",
      "discount": $json.discount,
      "account_code": $json.account_code,
      "product_code": $json.product_code
    }
  ]
}
}}`;

export class MetroErp {
	description = {
		displayName: 'MetroERP',
		name: 'metroErp',
		icon: 'file:metroerp.svg',
		group: ['transform'],
		version: 2,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Automate MetroERP contacts, invoices, and bills',
		defaults: {
			name: 'MetroERP',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'metroErpApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Invoice', value: 'invoice' },
					{ name: 'Bill', value: 'bill' },
				],
				default: 'contact',
			},

			// ---------- Contact operations ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a contact', description: 'Create a contact in MetroERP' },
					{ name: 'Get', value: 'get', action: 'Get a contact', description: 'Get a contact by ID' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many contacts', description: 'List contacts' },
					{ name: 'Update', value: 'update', action: 'Update a contact', description: 'Update a contact' },
				],
				default: 'create',
			},

			// ---------- Invoice operations ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['invoice'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create an invoice', description: 'Create a customer invoice' },
					{ name: 'Get', value: 'get', action: 'Get an invoice', description: 'Get an invoice by ID' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many invoices', description: 'List invoices' },
					{ name: 'Update', value: 'update', action: 'Update an invoice', description: 'Update a draft invoice' },
				],
				default: 'create',
			},

			// ---------- Bill operations ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['bill'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a bill', description: 'Create a vendor bill' },
					{ name: 'Get', value: 'get', action: 'Get a bill', description: 'Get a bill by ID' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many bills', description: 'List vendor bills' },
					{ name: 'Update', value: 'update', action: 'Update a bill', description: 'Update a draft bill' },
				],
				default: 'create',
			},

			// JSON body mode (Create / Update)
			{
				displayName: 'JSON Parameters',
				name: 'jsonParameters',
				type: 'boolean',
				default: false,
				description: 'Whether to send a full JSON body (like HTTP Request) instead of individual fields',
				displayOptions: {
					show: {
						resource: ['contact', 'invoice', 'bill'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'JSON Body',
				name: 'bodyJson',
				type: 'json',
				default: invoiceJsonDefault,
				description:
					'Request body sent to MetroERP. Use expressions to map Excel or previous-node columns.',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['create', 'update'],
						jsonParameters: [true],
					},
				},
			},
			{
				displayName: 'JSON Body',
				name: 'bodyJson',
				type: 'json',
				default: billJsonDefault,
				description:
					'Request body sent to MetroERP. Use expressions to map Excel or previous-node columns.',
				displayOptions: {
					show: {
						resource: ['bill'],
						operation: ['create', 'update'],
						jsonParameters: [true],
					},
				},
			},
			{
				displayName: 'JSON Body',
				name: 'bodyJson',
				type: 'json',
				default: `={{
{
  "name": $json.name || $json.customer_name,
  "email": $json.email,
  "phone": $json.phone,
  "uen": $json.uen,
  "address": $json.address,
  "is_company": true
}
}}`,
				description:
					'Request body sent to MetroERP. Use expressions to map Excel or previous-node columns.',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
						jsonParameters: [true],
					},
				},
			},

			// Contact fields
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['get', 'update'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'UEN',
				name: 'uen',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Is Company',
				name: 'isCompany',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				placeholder: 'Name, email, phone…',
				displayOptions: {
					show: { resource: ['contact'], operation: ['getAll'] },
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 200 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['contact', 'invoice', 'bill'],
						operation: ['getAll'],
					},
				},
			},

			// Invoice fields
			{
				displayName: 'Invoice ID',
				name: 'invoiceId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['get', 'update'],
					},
				},
			},
			{
				displayName: 'Bill ID',
				name: 'invoiceId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['bill'],
						operation: ['get', 'update'],
					},
				},
			},
			{
				displayName: 'Type',
				name: 'invoiceType',
				type: 'options',
				options: [
					{ name: 'Invoice (Customer)', value: 'invoice' },
					{ name: 'Bill (Vendor)', value: 'bill' },
				],
				default: 'invoice',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Type',
				name: 'invoiceType',
				type: 'options',
				options: [
					{ name: 'Invoice (Customer)', value: 'invoice' },
					{ name: 'Bill (Vendor)', value: 'bill' },
				],
				default: 'invoice',
				displayOptions: {
					show: { resource: ['invoice'], operation: ['getAll'] },
				},
			},
			{
				displayName: 'Partner ID',
				name: 'partnerId',
				type: 'string',
				default: '',
				description: 'Existing Metro contact ID (optional if Contact Name is set)',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Contact Name',
				name: 'contactName',
				type: 'string',
				default: '',
				description: 'Used to find or create a contact when Partner ID is empty',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Contact Email',
				name: 'contactEmail',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Contact Phone',
				name: 'contactPhone',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Contact UEN',
				name: 'contactUen',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Contact Address',
				name: 'contactAddress',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice'],
						operation: ['create'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Reference',
				name: 'reference',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Invoice Date',
				name: 'invoiceDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Due Date',
				name: 'dueDate',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: '',
				placeholder: 'SGD',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Post Invoice',
				name: 'post',
				type: 'boolean',
				default: false,
				description: 'Whether to post the invoice on update when the API key has Post Invoices enabled. Create always follows that API key setting.',
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
			},
			{
				displayName: 'Line Items',
				name: 'lineItems',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Line Item',
				default: {},
				displayOptions: {
					show: {
						resource: ['invoice', 'bill'],
						operation: ['create', 'update'],
						jsonParameters: [false],
					},
				},
				options: [
					{
						name: 'item',
						displayName: 'Item',
						values: [
							{
								displayName: 'Account Code',
								name: 'accountCode',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Discount',
								name: 'discount',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'Discount Type',
								name: 'discountType',
								type: 'options',
								options: [
									{ name: 'Percent', value: 'percent' },
									{ name: 'Fixed', value: 'fixed' },
								],
								default: 'percent',
							},
							{
								displayName: 'Product Code',
								name: 'productCode',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Product ID',
								name: 'productId',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Quantity',
								name: 'quantity',
								type: 'number',
								default: 1,
							},
							{
								displayName: 'Tax IDs',
								name: 'taxIds',
								type: 'string',
								default: '',
								description: 'Comma-separated tax IDs, e.g. 1,2',
							},
							{
								displayName: 'Unit Amount',
								name: 'unitAmount',
								type: 'number',
								default: 0,
							},
							{
								displayName: 'UoM',
								name: 'uom',
								type: 'string',
								default: '',
								description: 'Unit of measure name (e.g. Units)',
							},
						],
					},
				],
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Draft', value: 'draft' },
					{ name: 'Posted', value: 'posted' },
					{ name: 'Cancel', value: 'cancel' },
				],
				default: '',
				displayOptions: {
					show: { resource: ['invoice', 'bill'], operation: ['getAll'] },
				},
			},
		],
	};

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const returnData = [];
		const credentials = await this.getCredentials('metroErpApi');
		const baseUrl = String(credentials.baseUrl || '').replace(/\/+$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i);
				const operation = this.getNodeParameter('operation', i);
				let response;

				if (resource === 'contact') {
					response = await handleContact.call(this, baseUrl, operation, i);
				} else if (resource === 'invoice' || resource === 'bill') {
					response = await handleInvoice.call(this, baseUrl, operation, i, resource);
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, {
						itemIndex: i,
					});
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(response),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}
