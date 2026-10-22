module.exports = {
	credentials: [require('./credentials/MetroErpApi.credentials').MetroErpApi],
	nodes: [require('./nodes/MetroErp/MetroErp.node').MetroErp],
};
