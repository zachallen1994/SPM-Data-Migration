answer = (function transformEntry(source) {
    return (source.getValue('u_project_status') || '').toLowerCase().trim() == 'on hold' ? 'true' : 'false';
})(source);
