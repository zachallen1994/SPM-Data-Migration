# Header CSVs for new staging tables

The Adaptive API data sources now create a missing staging table themselves on the first run (one SETUP row,
then they stop so the id columns can be set to 100). Use these CSVs only if that does not work in your instance.

A "Custom (Load by Script)" data source fills a staging table. To create a table by hand instead, create it once from
its CSV here, then point the API data source at it.

1. Create a Data Source, Type **File**, Format **CSV**, attach the CSV, set the Import set table name
   (e.g. `u_import_adaptive_resources`), click **Load All Records**. This creates the table and its columns.
2. On the new table, set **Max length = 100** on Correlation ID, Parent Correlation ID and Project Correlation ID.
3. Delete the one `DELETE ME` row from the table.
4. Point the API data source at the table (Import set table name) and run it.

The API data sources match columns by **label**, so keep the header names exactly as they are.
