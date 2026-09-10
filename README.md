# Pharmacy-Managment-System

A professional pharmacy management system designed to manage medicines, inventory, sales, suppliers, users, and role-based operations through a secure and responsive web interface.

## Features

- Secure role-based login system
- Admin, Manager, and Counter/Cashier dashboards
- Medicine and product management
- Add medicines individually or import them in bulk using Excel
- Inventory and stock management
- Supplier and purchase management
- Low-stock and expired medicine monitoring
- Sales, profit, loss, and inventory reports
- Customer billing and invoice generation
- Automatic receipt generation after purchases
- Print or download customer receipts
- Discounts and sales transactions
- Real-time stock updates
- User activity and audit logs
- Responsive dashboard interface

## User Roles

### Admin

- Full system access
- Add, update, and delete products
- Add medicines individually or import multiple medicines using Excel
- Create, update, and delete users
- Manage roles and permissions
- View system-wide reports
- Manage system settings
- Monitor user activities
- Manage suppliers and purchase records
- Access complete inventory and sales history

### Manager

- Add, update, and delete products
- Add medicines individually or import multiple medicines using Excel
- Manage medicines and categories
- Manage incoming and outgoing stock
- Record supplier purchases
- Monitor low-stock and expired medicines
- View daily, weekly, and monthly sales reports
- Manage supplier information
- Track inventory and stock movement
- No access to user or system settings

### Counter / Cashier

- Search available medicines
- Handle customer sales
- Create and generate invoices
- Apply discounts when permitted
- Generate customer receipts
- Print or download receipts
- View available stock
- View personal daily sales summary
- No access to stock editing or management controls

## Tech Stack

### Frontend

- React 19
- TypeScript

### Backend

- TanStack Start Server Functions
- Supabase Auth
- Supabase Server-Side Admin Client
- Lovable Cloud

### Database

- PostgreSQL via Supabase

## Project Structure

```text
Pharmacy-Management-System/
├── dist/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── integrations/
│   ├── lib/
│   ├── routes/
│   └── server/
├── supabase/
│   ├── migrations/
 


```

## System Requirements

- Role-based authentication
- Responsive and user-friendly dashboard
- Real-time inventory updates
- Medicine, user, sales, supplier, and inventory management
- Individual and bulk medicine entry
- Excel file import for bulk medicine entry
- Audit logs for user activities
- Data validation and security
- Role-based permissions

## Project Goal

To provide a real-world pharmacy management solution for efficiently managing medicines, inventory, sales, suppliers, users, and daily pharmacy operations with secure role-based workflows.


## Author

**Arham Raza**  
Full-Stack Developer  
IBM Professional Certificate  
@MicroZee Solutions