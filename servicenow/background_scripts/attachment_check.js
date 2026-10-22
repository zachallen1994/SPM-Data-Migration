// Background Script (read-only): what Adaptive returns for one record's attachments, and whether the
// download call works. Changes nothing (no file is saved).
var RECORD_ID = '/Project/{05506AB6-EF2D-4C34-A15F-2058DB718D4C}';   // ✏️ an Adaptive id that has files (Willow)
var base = gs.getProperty('x_mig.adaptive.url');
function call(method, path, body) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod(method);
    r.setEndpoint(base + path);
    r.setRequestHeader('Authorization', 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'));
    r.setRequestHeader('Content-Type', 'application/json');
    if (body) r.setRequestBody(JSON.stringify(body));
    var res = r.execute();
    gs.print(method + ' ' + path + ' -> ' + res.getStatusCode());
    return res.getBody();
}
// 1. The raw attachment links and their document fields
var body = call('POST', '/data/query', { q: "SELECT Document, Document.Name, Document.Url, Document.StorageType FROM AttachmentLink WHERE Entity = '" + RECORD_ID + "'", paging: { from: 0, limit: 10 } });
gs.print(body.substring(0, 3000));
// 2. Try the download call for the first document
var rows = (JSON.parse(body).entities || []);
if (rows.length && rows[0].Document) {
    var d = call('GET', '/files/download?documentId=' + encodeURIComponent(rows[0].Document.id) + '&redirect=false');
    gs.print(d.substring(0, 1000));
}
