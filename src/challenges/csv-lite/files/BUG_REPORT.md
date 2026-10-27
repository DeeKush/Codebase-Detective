# Bug report

When we import a customer export, the list has a few extra empty records. It happens when the file has an empty line between two rows or extra empty lines at the end, which Windows exports often have. The README says blank lines are ignored. Files without blank lines import fine.
