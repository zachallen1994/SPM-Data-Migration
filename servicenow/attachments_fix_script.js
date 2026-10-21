// Fix Script: copy attachments from Asana / Adaptive onto the migrated ServiceNow records.
// Run LAST, after all records exist. Safe to re-run: a file already attached (same name) is skipped.
// Start with DRY_RUN = true: it only logs what it would do (System Logs, source "x_mig.attachments").
var DRY_RUN = true;
var TABLES = ['pm_project', 'pm_project_task', 'dmn_demand', 'issue', 'risk'];   // records with an ASANA:/ADAPTIVE: correlation_id
var ONLY = [];   // ✏️ test on a few records first: correlation_ids, e.g. ['ADAPTIVE:/Project/{05506AB6-...}', 'ASANA:1219075311754614']
                //    [] = every migrated record
var MAX_MB = 0;                                                   // 0 = no limit (every stored file is copied);
                                                                  // ServiceNow's own max size (com.glide.attachment.max_size) still applies

// Adaptive (from Discovery): AttachmentLink.Entity = the record, AttachmentLink.Document = the file.
// Document.Name = file name, Document.Url = set when the file lives outside Adaptive (e.g. a link or SharePoint).
var ADAPTIVE_LINK_QUERY = "SELECT Document, Document.Name, Document.Url, Document.StorageType FROM AttachmentLink WHERE Entity = '{id}'";
// Download call: NOT yet proven against this tenant - the DRY_RUN on one project shows whether it returns a url.
var ADAPTIVE_DOWNLOAD = '/files/download?documentId={doc}&redirect=false';   // expected to return {"url": "..."}

var LOG = 'x_mig.attachments';
var stats = { found: 0, copied: 0, skipped: 0, linked: 0, failed: 0 };   // found = files stored in Asana/Adaptive

function already(table, sysId, fileName) {
    var a = new GlideRecord('sys_attachment');
    a.addQuery('table_name', table);
    a.addQuery('table_sys_id', sysId);
    a.addQuery('file_name', fileName);
    a.setLimit(1);
    a.query();
    return a.hasNext();
}

function download(url, headers, table, sysId, fileName) {
    if (already(table, sysId, fileName)) { stats.skipped++; return; }
    if (DRY_RUN) { gs.log('[DRY RUN] would copy ' + fileName + ' -> ' + table + '/' + sysId, LOG); return; }
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint(url);
    for (var h in headers) r.setRequestHeader(h, headers[h]);
    r.saveResponseBodyAsAttachment(table, sysId, fileName);
    var res = r.execute();
    if (res.getStatusCode() == 200) stats.copied++;
    else { stats.failed++; gs.logError('Download failed ' + res.getStatusCode() + ' for ' + fileName + ' on ' + table + '/' + sysId, LOG); }
}

function addLinkNote(gr, text) {
    if (DRY_RUN) { gs.log('[DRY RUN] would add work note: ' + text, LOG); return; }
    gr.work_notes = text;
    gr.update();
    stats.linked++;
}

function getJson(url, headers) {
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('GET');
    r.setEndpoint(url);
    for (var h in headers) r.setRequestHeader(h, headers[h]);
    var res = r.execute();
    if (res.getStatusCode() != 200) throw res.getStatusCode() + ': ' + res.getBody();
    return JSON.parse(res.getBody());
}

// ---- Asana: GET /attachments?parent=<task gid>
function asanaFiles(gr, gid) {
    var auth = { 'Authorization': 'Bearer ' + gs.getProperty('x_mig.asana.token') };
    var list = getJson('https://app.asana.com/api/1.0/attachments?parent=' + gid +
        '&opt_fields=name,host,size,download_url,view_url', auth).data;
    list.forEach(function (f) {
        if (f.host == 'asana' && f.download_url) {
            stats.found++;
            if (MAX_MB && f.size && f.size > MAX_MB * 1048576) { stats.failed++; gs.logWarning('Too large, copy by hand: ' + f.name, LOG); return; }
            // download_url is a short-lived signed link: fetch it straight away, WITHOUT the Asana token
            download(f.download_url, {}, gr.getTableName(), gr.getUniqueValue(), f.name);
        } else {
            // Google Drive / Box / Dropbox / OneDrive links cannot be downloaded: keep them as a link
            addLinkNote(gr, 'Legacy Asana linked file (' + f.host + '): ' + f.name + ' - ' + (f.view_url || ''));
        }
    });
}

// ---- Adaptive: files linked to the work item
function adaptiveFiles(gr, id) {
    var base = gs.getProperty('x_mig.adaptive.url');
    var auth = { 'Authorization': 'ApiKey ' + gs.getProperty('x_mig.adaptive.key'), 'Content-Type': 'application/json' };
    var r = new sn_ws.RESTMessageV2();
    r.setHttpMethod('POST');
    r.setEndpoint(base + '/data/query');
    for (var h in auth) r.setRequestHeader(h, auth[h]);
    r.setRequestBody(JSON.stringify({ q: ADAPTIVE_LINK_QUERY.replace('{id}', id), paging: { from: 0, limit: 100 } }));
    var res = r.execute();
    if (res.getStatusCode() != 200) throw res.getStatusCode() + ': ' + res.getBody();
    JSON.parse(res.getBody()).entities.forEach(function (link) {
        var doc = link.Document || {};
        stats.found++;
        var name = doc.Name || 'attachment';
        if (doc.Url) {                                            // file kept outside Adaptive: keep the link
            addLinkNote(gr, 'Legacy Adaptive linked file: ' + name + ' - ' + doc.Url);
            return;
        }
        var file;
        try { file = getJson(base + ADAPTIVE_DOWNLOAD.replace('{doc}', encodeURIComponent(doc.id)), auth); }
        catch (err) { stats.failed++; gs.logError('Adaptive download link failed for ' + name + ' on ' + id + ': ' + err, LOG); return; }
        if (file.url) download(file.url, {}, gr.getTableName(), gr.getUniqueValue(), name);
        else { stats.failed++; gs.logError('No download url for ' + name + ' on ' + id + ': ' + JSON.stringify(file), LOG); }
    });
}

TABLES.forEach(function (table) {
    var gr = new GlideRecord(table);
    if (ONLY.length) gr.addQuery('correlation_id', 'IN', ONLY.join(','));
    else gr.addQuery('correlation_id', 'STARTSWITH', 'ASANA:').addOrCondition('correlation_id', 'STARTSWITH', 'ADAPTIVE:');
    gr.query();
    while (gr.next()) {
        var corr = gr.getValue('correlation_id');
        try {
            if (corr.indexOf('ASANA:') == 0) asanaFiles(gr, corr.substring(6));
            else adaptiveFiles(gr, corr.substring(9));
        } catch (err) {
            stats.failed++;
            gs.logError(table + ' ' + corr + ': ' + err, LOG);
        }
    }
});
gs.log('Attachments done' + (DRY_RUN ? ' (DRY RUN)' : '') + ': ' + JSON.stringify(stats) +
    ' - complete when copied + skipped = found and failed = 0', LOG);
