'use strict';

class MetroErpApi {
	name = 'metroErpApi';
	displayName = 'MetroERP API';
	documentationUrl = 'https://metrogroup.solutions/';
	properties = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your-metro.example.com',
			required: true,
			description: 'Public Metro base URL, without a trailing slash',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'API key from Accounting → n8n Integration → API Keys',
		},
	];

	authenticate = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/n8n/v1/health',
			method: 'GET',
		},
	};
}

module.exports = { MetroErpApi };
