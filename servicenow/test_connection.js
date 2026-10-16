// Paste into: Scripts - Background. Run in each instance (Dev, Test, Prod).
// Pass = both lines say Status: 200.
function call(method, url, headers, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(url);
    for (var h in headers) r.setRequestHeader(h, headers[h]);
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    return res.getStatusCode() + '  ' + res.getBody().substring(0, 200);
}

gs.info('Adaptive  Status: ' + call('POST', gs.getProperty('x_mig.adaptive.url') + '/data/query',
    { 'Authorization': 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'), 'Content-Type': 'application/json' },
    { q: 'SELECT Name FROM Project', paging: { from: 0, limit: 2 } }));

gs.info('Asana     Status: ' + call('GET', 'https://app.asana.com/api/1.0/projects/' +
    gs.getProperty('x_mig.asana.project_gid') + '/tasks?limit=2&opt_fields=name',
    { 'Authorization': 'Bearer ' + gs.getProperty('x_mig.asana.token') }));
