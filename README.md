# n8n-nodes-metroerp

Create and update **contacts**, **customer invoices**, and **vendor bills** in MetroERP from n8n.

## Install

In n8n, open **Settings → Community nodes** and install:

```text
n8n-nodes-metroerp
```

On n8n Cloud this package must be a verified community node before it can be installed.

## Credential

Create a credential named **MetroERP API**:

| Field | Value |
|---|---|
| Base URL | Your public Metro URL, for example `https://metro.yourcompany.com` |
| API Key | From Metro: **Accounting → Configuration → n8n Integration → API Keys** |

The API key needs Contacts and Invoices access. Bills use the Invoices permission.

n8n Cloud cannot call `http://localhost`. The Metro site must be reachable over HTTPS.

## Nodes

Search for **MetroERP**.

| Resource | Operations |
|---|---|
| Contact | Create, Get, Get Many, Update |
| Invoice | Create, Get, Get Many, Update |
| Bill | Create, Get, Get Many, Update |

### Excel upload

1. Add a form or manual trigger and upload an `.xlsx` file.
2. Add **Extract from File** so each row becomes one item.
3. Add **MetroERP**.
4. Turn on **JSON Parameters** and map columns in **JSON Body**.

Invoice columns: `customer_name`, `email`, `reference`, `currency`, `description`, `quantity`, `unit_amount`.

Bill columns: `vendor_name`, `email`, `reference`, `currency`, `description`, `quantity`, `unit_amount`.

Empty optional columns are accepted. `customer_name` or `vendor_name`, plus `description`, are required.

## API

The node calls:

```text
POST /api/n8n/v1/contacts
POST /api/n8n/v1/invoices
POST /api/n8n/v1/bills
```

Authorization header: `Authorization: Bearer <api_key>`.
