// Netlify Function for testing server connection
exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            message: 'Server is running!',
            timestamp: new Date().toISOString(),
            platform: 'Netlify Functions'
        })
    };
};

