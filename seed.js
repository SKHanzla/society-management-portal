require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Payment = require('./models/Payment');
const Expense = require('./models/Expense');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing
  await Promise.all([User.deleteMany(), Payment.deleteMany(), Expense.deleteMany()]);
  console.log('Cleared existing data');

  // Create Admin
  const admin = await User.create({
    name: 'Aamir Khan (President)',
    houseNumber: 'A-01',
    phone: '03001234567',
    password: 'admin123',
    role: 'admin',
    block: 'A'
  });

  // Create Residents
  const residentData = [
    { name: 'Bilal Ahmed', houseNumber: 'A-02', phone: '03112345678', block: 'A' },
    { name: 'Sara Malik', houseNumber: 'A-03', phone: '03223456789', block: 'A' },
    { name: 'Usman Ali', houseNumber: 'B-01', phone: '03334567890', block: 'B' },
    { name: 'Ayesha Raza', houseNumber: 'B-02', phone: '03445678901', block: 'B' },
    { name: 'Kamran Sheikh', houseNumber: 'B-03', phone: '03556789012', block: 'B' },
    { name: 'Fatima Zahra', houseNumber: 'C-01', phone: '03667890123', block: 'C' },
    { name: 'Hassan Rauf', houseNumber: 'C-02', phone: '03778901234', block: 'C' },
    { name: 'Nadia Tariq', houseNumber: 'C-03', phone: '03889012345', block: 'C' },
    { name: 'Zubair Qureshi', houseNumber: 'D-01', phone: '03990123456', block: 'D' },
    { name: 'Mariam Siddiqui', houseNumber: 'D-02', phone: '03101234567', block: 'D' }
  ];

  const residents = await User.create(residentData.map(r => ({ ...r, password: 'resident123' })));
  console.log(`Created ${residents.length} residents`);

  // Create payments for current and last months
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const payments = [];
  
  // All paid last month
  for (const resident of residents) {
    payments.push({
      resident: resident._id,
      month: lastMonth,
      amount: 2000,
      lateFee: 0,
      totalAmount: 2000,
      status: 'verified',
      paymentMode: 'easypaisa_manual',
      referenceId: `EP${Math.floor(Math.random() * 1000000)}`,
      submittedAt: new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 8),
      verifiedAt: new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 9),
      verifiedBy: admin._id
    });
  }

  // Current month: mix of statuses
  payments.push({
    resident: residents[0]._id, month: currentMonth, amount: 2000, lateFee: 0,
    totalAmount: 2000, status: 'verified', paymentMode: 'easypaisa_manual',
    referenceId: 'EP789012', submittedAt: new Date(), verifiedAt: new Date(), verifiedBy: admin._id
  });
  payments.push({
    resident: residents[1]._id, month: currentMonth, amount: 2000, lateFee: 0,
    totalAmount: 2000, status: 'submitted', paymentMode: 'easypaisa_manual',
    referenceId: 'EP890123', submittedAt: new Date()
  });
  payments.push({
    resident: residents[2]._id, month: currentMonth, amount: 2000, lateFee: 200,
    totalAmount: 2200, status: 'verified', paymentMode: 'cash',
    referenceId: 'CASH001', submittedAt: new Date(), verifiedAt: new Date(), verifiedBy: admin._id
  });

  await Payment.create(payments);
  console.log(`Created ${payments.length} payment records`);

  // Create expenses
  const expenses = [
    { title: 'Security Guard Salary', description: 'Monthly salary for 2 guards', amount: 30000, category: 'security', date: new Date(now.getFullYear(), now.getMonth(), 5), addedBy: admin._id },
    { title: 'Generator Fuel', description: 'Diesel for backup generator', amount: 8000, category: 'utilities', date: new Date(now.getFullYear(), now.getMonth(), 3), addedBy: admin._id },
    { title: 'Water Pump Repair', description: 'Replaced motor pump', amount: 15000, category: 'repairs', date: new Date(now.getFullYear(), now.getMonth(), 1), addedBy: admin._id },
    { title: 'Cleaning Staff', description: 'Monthly cleaning service', amount: 12000, category: 'cleaning', date: new Date(now.getFullYear(), now.getMonth(), 2), addedBy: admin._id },
    { title: 'Garden Maintenance', description: 'Monthly gardening service', amount: 5000, category: 'gardening', date: new Date(now.getFullYear(), now.getMonth(), 4), addedBy: admin._id },
    // Last month expenses
    { title: 'Security Guard Salary', amount: 30000, category: 'security', date: new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 5), addedBy: admin._id },
    { title: 'Electricity Bill', amount: 22000, category: 'utilities', date: new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 15), addedBy: admin._id }
  ];

  await Expense.create(expenses);
  console.log(`Created ${expenses.length} expense records`);

  console.log('\n✅ Seed completed!');
  console.log('\n📋 Login Credentials:');
  console.log('Admin: Phone: 03001234567, Password: admin123');
  console.log('Resident: Phone: 03112345678, Password: resident123');
  console.log('Or use house number: A-02, Password: resident123');

  process.exit(0);
};

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
