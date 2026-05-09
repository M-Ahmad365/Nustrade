'use strict';

/**
 * Seed script — 1 admin, 30 students, 9 categories, 80 listings,
 * 40 offers, 20 transactions, 25 reviews, 30 wishlist items,
 * 10 saved searches, 50 notifications (MongoDB).
 * Idempotent: each phase skips if its target count already satisfied.
 * Run via: npm run db:seed  (from backend/)
 */

require('dotenv').config();

const { Pool }       = require('pg');
const bcrypt         = require('bcrypt');
const { MongoClient } = require('mongodb');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DB,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD || '',
});

// ── students ──────────────────────────────────────────────────────────────────
// 20 hostellites across real NUST hostels; 10 day scholars
// Departments: SEECS×10, NBS×5, S3H×5, SMME×5, other×5
const STUDENTS = [
  // SEECS — 8 hostellites + 2 day scholars
  { email: 'ali.hassan@nust.edu.pk',     name: 'Ali Hassan',     dept: 'SEECS', sem: 6, res: 'hostellite',  hostel: 'Ghazali'  },
  { email: 'usman.malik@nust.edu.pk',    name: 'Usman Malik',    dept: 'SEECS', sem: 4, res: 'hostellite',  hostel: 'Razi'     },
  { email: 'bilal.ahmed@nust.edu.pk',    name: 'Bilal Ahmed',    dept: 'SEECS', sem: 2, res: 'hostellite',  hostel: 'Rahmat'   },
  { email: 'hamza.khan@nust.edu.pk',     name: 'Hamza Khan',     dept: 'SEECS', sem: 8, res: 'hostellite',  hostel: 'Attar'    },
  { email: 'saad.tariq@nust.edu.pk',     name: 'Saad Tariq',     dept: 'SEECS', sem: 3, res: 'hostellite',  hostel: 'Liaquat'  },
  { email: 'omer.farooq@nust.edu.pk',    name: 'Omer Farooq',    dept: 'SEECS', sem: 5, res: 'hostellite',  hostel: 'Hajveri'  },
  { email: 'zain.ali@nust.edu.pk',       name: 'Zain Ali',       dept: 'SEECS', sem: 7, res: 'hostellite',  hostel: 'Zakria'   },
  { email: 'fahad.siddiqui@nust.edu.pk', name: 'Fahad Siddiqui', dept: 'SEECS', sem: 1, res: 'hostellite',  hostel: 'Johar'    },
  { email: 'ahmed.raza@nust.edu.pk',     name: 'Ahmed Raza',     dept: 'SEECS', sem: 4, res: 'day_scholar', hostel: null       },
  { email: 'talha.butt@nust.edu.pk',     name: 'Talha Butt',     dept: 'SEECS', sem: 6, res: 'day_scholar', hostel: null       },
  // NBS — 3 hostellites + 2 day scholars
  { email: 'sana.iqbal@nust.edu.pk',     name: 'Sana Iqbal',     dept: 'NBS',   sem: 3, res: 'hostellite',  hostel: 'Fatima'   },
  { email: 'maria.aslam@nust.edu.pk',    name: 'Maria Aslam',    dept: 'NBS',   sem: 5, res: 'hostellite',  hostel: 'Amna'     },
  { email: 'hira.jamil@nust.edu.pk',     name: 'Hira Jamil',     dept: 'NBS',   sem: 2, res: 'hostellite',  hostel: 'Khadija'  },
  { email: 'nadia.sheikh@nust.edu.pk',   name: 'Nadia Sheikh',   dept: 'NBS',   sem: 7, res: 'day_scholar', hostel: null       },
  { email: 'amna.akhtar@nust.edu.pk',    name: 'Amna Akhtar',    dept: 'NBS',   sem: 4, res: 'day_scholar', hostel: null       },
  // S3H — 2 hostellites + 3 day scholars
  { email: 'danish.qureshi@nust.edu.pk', name: 'Danish Qureshi', dept: 'S3H',   sem: 5, res: 'hostellite',  hostel: 'Berouni'  },
  { email: 'faisal.mehmood@nust.edu.pk', name: 'Faisal Mehmood', dept: 'S3H',   sem: 3, res: 'hostellite',  hostel: 'Rumi'     },
  { email: 'asim.nawaz@nust.edu.pk',     name: 'Asim Nawaz',     dept: 'S3H',   sem: 6, res: 'day_scholar', hostel: null       },
  { email: 'irfan.cheema@nust.edu.pk',   name: 'Irfan Cheema',   dept: 'S3H',   sem: 2, res: 'day_scholar', hostel: null       },
  { email: 'shahid.hussain@nust.edu.pk', name: 'Shahid Hussain', dept: 'S3H',   sem: 4, res: 'day_scholar', hostel: null       },
  // SMME — 3 hostellites + 2 day scholars
  { email: 'kashif.anwar@nust.edu.pk',   name: 'Kashif Anwar',   dept: 'SMME',  sem: 7, res: 'hostellite',  hostel: 'Attar'    },
  { email: 'imran.baig@nust.edu.pk',     name: 'Imran Baig',     dept: 'SMME',  sem: 5, res: 'hostellite',  hostel: 'Liaquat'  },
  { email: 'naveed.sultan@nust.edu.pk',  name: 'Naveed Sultan',  dept: 'SMME',  sem: 3, res: 'hostellite',  hostel: 'Hajveri'  },
  { email: 'waseem.rana@nust.edu.pk',    name: 'Waseem Rana',    dept: 'SMME',  sem: 1, res: 'day_scholar', hostel: null       },
  { email: 'tariq.mehmood@nust.edu.pk',  name: 'Tariq Mehmood',  dept: 'SMME',  sem: 8, res: 'day_scholar', hostel: null       },
  // Other depts — 4 hostellites + 1 day scholar
  { email: 'rizwan.baig@nust.edu.pk',    name: 'Rizwan Baig',    dept: 'SCEE',  sem: 4, res: 'hostellite',  hostel: 'Zakria'   },
  { email: 'junaid.hassan@nust.edu.pk',  name: 'Junaid Hassan',  dept: 'SCME',  sem: 6, res: 'hostellite',  hostel: 'Johar'    },
  { email: 'ayesha.noor@nust.edu.pk',    name: 'Ayesha Noor',    dept: 'SNS',   sem: 3, res: 'hostellite',  hostel: 'Amna'     },
  { email: 'komal.bibi@nust.edu.pk',     name: 'Komal Bibi',     dept: 'ASAB',  sem: 5, res: 'hostellite',  hostel: 'Fatima'   },
  { email: 'hassan.gillani@nust.edu.pk', name: 'Hassan Gillani', dept: 'MCS',   sem: 2, res: 'day_scholar', hostel: null       },
];

// ── categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { slug: 'books',             name: 'Books & Notes',     desc: 'Textbooks, reference books, lecture notes', ord: 1 },
  { slug: 'electronics',       name: 'Electronics',       desc: 'Laptops, phones, accessories, tablets',     ord: 2 },
  { slug: 'furniture',         name: 'Furniture',         desc: 'Desks, chairs, beds, storage',              ord: 3 },
  { slug: 'bikes',             name: 'Bikes & Cycles',    desc: 'Bicycles, motorcycles, scooters',           ord: 4 },
  { slug: 'clothing',          name: 'Clothing',          desc: 'Hoodies, formal wear, shoes',               ord: 5 },
  { slug: 'stationery',        name: 'Stationery',        desc: 'Drawing kits, calculators, lab equipment',  ord: 6 },
  { slug: 'hostel_essentials', name: 'Hostel Essentials', desc: 'Heaters, kettles, bedding, cookware',       ord: 7 },
  { slug: 'sports',            name: 'Sports',            desc: 'Equipment, gear, jerseys',                  ord: 8 },
  { slug: 'other',             name: 'Other',             desc: "Anything that doesn't fit",                 ord: 9 },
];

// ── listings ──────────────────────────────────────────────────────────────────
// seller: index into STUDENTS array, cycles with (i % count)
// days:   how many days ago posted_at is set (for analytics spread)
//         books old (60–175d) → show in semester-end surge
//         electronics mid (9–117d), hostel/furniture recent (1–58d), bikes/other 1–12d
// expires_at is always NOW()+30d so all listings remain active in the feed
const LISTINGS = [
  // ── Books ×20  (course-coded, old dates for semester-surge analytics) ─────
  { cat: 'books', title: 'CS-101 Intro to Programming Deitel 10th Ed', desc: 'Lightly used, no highlighting. Great for CS freshmen covering Python basics through OOP.', price: 500,    neg: true,  cond: 'good',     hostel: 'Ghazali', off: false, course: 'CS-101',  days: 175, seller: 0  },
  { cat: 'books', title: 'CS-201 Data Structures — Mark Allen Weiss',  desc: 'Pen marks on first 3 chapters only. Covers trees, graphs, sorting, hashing in depth.',    price: 600,    neg: true,  cond: 'good',     hostel: 'Razi', off: false, course: 'CS-201',  days: 168, seller: 1  },
  { cat: 'books', title: 'CS-236 Advanced Database Systems Ramakrishnan', desc: 'Like new, covered from day 1. Matches ADBMS course outline exactly. Unused exercises.',   price: 700,    neg: false, cond: 'like_new', hostel: 'Rahmat', off: false, course: 'CS-236',  days: 162, seller: 2  },
  { cat: 'books', title: 'CS-251 Operating Systems Silberschatz 10th', desc: 'Some highlighter on memory management chapters. Otherwise clean and complete copy.',         price: 550,    neg: true,  cond: 'fair',     hostel: 'Attar', off: false, course: 'CS-251',  days: 156, seller: 3  },
  { cat: 'books', title: 'CS-301 Computer Networks Tanenbaum 5th Ed',  desc: 'Good condition, spine intact. Chapters on TCP/IP and routing well-studied but readable.',    price: 600,    neg: true,  cond: 'good',     hostel: 'Liaquat', off: false, course: 'CS-301',  days: 150, seller: 4  },
  { cat: 'books', title: 'CS-345 Software Engineering Sommerville 10th', desc: 'Fair condition, some page corners folded. Full text intact including agile chapters.',      price: 500,    neg: true,  cond: 'fair',     hostel: 'Hajveri', off: false, course: 'CS-345',  days: 144, seller: 5  },
  { cat: 'books', title: 'EE-101 Circuits and Electronics Nilsson 9th', desc: 'Good shape, no missing pages. Circuit analysis and AC theory chapters are well-annotated.',  price: 450,    neg: true,  cond: 'good',     hostel: 'Zakria', off: false, course: 'EE-101',  days: 138, seller: 6  },
  { cat: 'books', title: 'MATH-101 Calculus Early Transcendentals',    desc: 'Like new. Used one semester only. Bought new — selling because course completed.',           price: 700,    neg: false, cond: 'like_new', hostel: 'Johar', off: false, course: 'MATH-101', days: 132, seller: 7  },
  { cat: 'books', title: 'MATH-201 Linear Algebra Gilbert Strang 4th', desc: 'Clean copy with solution manual included. Perfect for MATH-201 and machine learning prep.',   price: 650,    neg: true,  cond: 'good',     hostel: 'Fatima', off: false, course: 'MATH-201', days: 126, seller: 10 },
  { cat: 'books', title: 'PHY-101 University Physics Sears Vol 1',     desc: 'Some pencil marks in kinematics chapters, easily erasable. All pages present and bound.',     price: 550,    neg: true,  cond: 'fair',     hostel: 'Amna', off: false, course: 'PHY-101',  days: 120, seller: 11 },
  { cat: 'books', title: 'ENGL-104 Technical Writing for Engineers',   desc: 'Good condition. Covers proposal writing, lab reports, and presentation skills for engineers.', price: 300,    neg: false, cond: 'good',     hostel: null,  off: true,  course: 'ENGL-104', days: 114, seller: 8  },
  { cat: 'books', title: 'CS-201 Discrete Mathematics Rosen 7th Ed',   desc: 'Well-maintained. Logic, set theory, and graph theory chapters marked but readable.',          price: 500,    neg: true,  cond: 'good',     hostel: 'Ghazali', off: false, course: 'CS-201',  days: 108, seller: 15 },
  { cat: 'books', title: 'CS-401 Compiler Design Dragon Book 2nd Ed',  desc: 'Like new condition. Aho, Lam, Sethi — used only for exam prep. Minimal notes inside.',       price: 750,    neg: false, cond: 'like_new', hostel: 'Razi', off: false, course: 'CS-401',  days: 102, seller: 16 },
  { cat: 'books', title: 'CS-460 Artificial Intelligence Russell Norvig', desc: 'Like new. AIMA 4th edition. Covers search, ML, NLP, and robotics. Unused exercises.',      price: 900,    neg: true,  cond: 'like_new', hostel: 'Rahmat', off: false, course: 'CS-460',  days: 96,  seller: 2  },
  { cat: 'books', title: 'HU-101 Engineering Economics Newman 3rd Ed', desc: 'Fair condition with notes in margins. Time-value, depreciation, rate of return all covered.',  price: 400,    neg: true,  cond: 'fair',     hostel: 'Attar', off: false, course: 'HU-101',  days: 90,  seller: 20 },
  { cat: 'books', title: 'ME-201 Thermodynamics Cengel & Boles 8th Ed', desc: 'Good condition, all figures intact. Thermodynamic cycles and steam tables included.',        price: 600,    neg: true,  cond: 'good',     hostel: 'Liaquat', off: false, course: 'ME-201',  days: 84,  seller: 21 },
  { cat: 'books', title: 'EE-201 Signals and Systems Oppenheim 2nd',   desc: 'Good shape. Fourier, Laplace, Z-transform sections have neat notes. Very useful reference.',  price: 700,    neg: true,  cond: 'good',     hostel: 'Hajveri', off: false, course: 'EE-201',  days: 78,  seller: 5  },
  { cat: 'books', title: 'EE-202 Digital Logic Design Floyd 10th Ed',  desc: 'Fair, covers combinational and sequential circuits. A few pages dog-eared but readable.',     price: 550,    neg: true,  cond: 'fair',     hostel: 'Zakria', off: false, course: 'EE-202',  days: 72,  seller: 6  },
  { cat: 'books', title: 'HU-102 Pakistan Studies Notes Bundle',       desc: 'Handwritten notes bundle covering full HU-102 syllabus. Saves a semester of note-taking.',   price: 250,    neg: false, cond: 'poor',     hostel: null,  off: true,  course: 'HU-102',  days: 66,  seller: 9  },
  { cat: 'books', title: 'CHEM-101 Organic Chemistry Clayden 2nd Ed',  desc: 'Good condition, no missing pages. Mechanisms and reactions annotated for quick revision.',    price: 650,    neg: true,  cond: 'good',     hostel: 'Johar', off: false, course: 'CHEM-101', days: 60,  seller: 7  },

  // ── Electronics ×20 ──────────────────────────────────────────────────────
  { cat: 'electronics', title: 'Dell Latitude 5490 Core i5 8GB 256GB SSD', desc: 'Good working condition. Battery holds 3–4 hrs. Comes with charger. No physical damage.', price: 38000,  neg: true,  cond: 'good',     hostel: 'Ghazali', off: false, course: null, days: 117, seller: 0  },
  { cat: 'electronics', title: 'HP EliteBook 840 Core i7 16GB 512GB SSD',  desc: 'Like new, light scratches on lid. Battery lasts 5–6 hrs. Charger and sleeve included.',  price: 55000,  neg: true,  cond: 'like_new', hostel: 'Razi', off: false, course: null, days: 111, seller: 1  },
  { cat: 'electronics', title: 'Samsung Galaxy A32 64GB Dual SIM',          desc: 'Good condition. Screen protector on. Minor scratches on back. Full charge holds 1.5 days.', price: 22000,  neg: true,  cond: 'good',     hostel: 'Rahmat', off: false, course: null, days: 105, seller: 2  },
  { cat: 'electronics', title: 'Realme Narzo 50 128GB 4GB RAM',             desc: 'Good shape, charging port slightly loose but works fine. Original box included.', price: 18000,  neg: true,  cond: 'good',     hostel: 'Attar', off: false, course: null, days: 99,  seller: 3  },
  { cat: 'electronics', title: 'Casio FX-991ES Plus Scientific Calculator', desc: 'Like new with cover. Used for one exam only. Works perfectly. Essential for all STEM courses.', price: 2200,   neg: false, cond: 'like_new', hostel: 'Liaquat', off: false, course: null, days: 93,  seller: 4  },
  { cat: 'electronics', title: 'Apple MacBook Air M1 8GB 256GB (Battery)',  desc: 'Fair condition, battery health 67% — needs replacement (est. Rs 12k). Otherwise perfect.', price: 72000,  neg: true,  cond: 'fair',     hostel: 'Hajveri', off: false, course: null, days: 87,  seller: 5  },
  { cat: 'electronics', title: 'Laptop Cooling Pad with Dual USB Hub',      desc: 'Good condition. Two fans, three USB ports. Fits up to 15.6-inch laptops. Works fine.', price: 1500,   neg: false, cond: 'good',     hostel: 'Zakria', off: false, course: null, days: 81,  seller: 6  },
  { cat: 'electronics', title: 'USB-C 7-in-1 Hub (HDMI, USB-A, SD Card)',   desc: 'Like new. Supports 4K HDMI, 3x USB-A, SD, microSD, PD charging. Used twice.', price: 2500,   neg: false, cond: 'like_new', hostel: 'Johar', off: false, course: null, days: 75,  seller: 7  },
  { cat: 'electronics', title: 'Logitech M280 Wireless Mouse',              desc: 'Good condition. Nano receiver included. AA battery lasts months. Suitable for all OSes.', price: 1800,   neg: false, cond: 'good',     hostel: 'Fatima', off: false, course: null, days: 69,  seller: 10 },
  { cat: 'electronics', title: 'HDMI 2.0 Braided Cable 2m 4K@60Hz',        desc: 'New in package. Supports 4K 60Hz and HDR. Fits projector rooms and monitor setups.', price: 500,    neg: false, cond: 'new',      hostel: 'Amna', off: false, course: null, days: 63,  seller: 11 },
  { cat: 'electronics', title: 'WD Elements 1TB USB 3.0 External HDD',     desc: 'Good working condition. Transfer speeds normal. No bad sectors. Carry pouch included.', price: 6500,   neg: true,  cond: 'good',     hostel: 'Khadija', off: false, course: null, days: 57,  seller: 12 },
  { cat: 'electronics', title: 'Anker PowerCore 10000mAh Power Bank',       desc: 'Good condition, holds charge well. Charges a phone 2–3 times. Micro-USB input, USB-A out.', price: 3000,   neg: false, cond: 'good',     hostel: 'Fatima', off: false, course: null, days: 51,  seller: 26 },
  { cat: 'electronics', title: 'JBL Tune 110 Wired In-Ear Earphones',      desc: 'Fair, left bud slightly quieter. Usable but not perfect. Sold as-is, priced accordingly.', price: 1500,   neg: true,  cond: 'fair',     hostel: 'Ghazali', off: false, course: null, days: 45,  seller: 15 },
  { cat: 'electronics', title: 'Sony WH-CH510 Wireless Headphones',        desc: 'Good condition. 35hr battery, works perfectly. Minor paint wear on headband. No mic issue.', price: 4500,   neg: true,  cond: 'good',     hostel: 'Razi', off: false, course: null, days: 39,  seller: 16 },
  { cat: 'electronics', title: 'Flexible Phone Tripod 50cm Bendable Legs',  desc: 'Good shape, all joints firm. Holds phones up to 200g. Useful for online quizzes and vlogs.', price: 800,    neg: false, cond: 'good',     hostel: 'Rahmat', off: false, course: null, days: 33,  seller: 17 },
  { cat: 'electronics', title: 'HP Laptop Carry Bag 15.6-inch Padded',     desc: 'Good condition with no tears. Front pocket for accessories. Shoulder strap adjustable.', price: 2000,   neg: false, cond: 'good',     hostel: 'Attar', off: false, course: null, days: 27,  seller: 3  },
  { cat: 'electronics', title: 'Redragon K552 Mechanical Gaming Keyboard',  desc: 'Like new. Red switches, RGB backlit. Used 2 months. Includes original USB cable.', price: 5500,   neg: true,  cond: 'like_new', hostel: 'Liaquat', off: false, course: null, days: 21,  seller: 4  },
  { cat: 'electronics', title: 'Samsung 22-inch Full HD 1080p Monitor',    desc: 'Good condition, no dead pixels. VGA and HDMI ports. Selling because upgrading to 27-inch.', price: 12000,  neg: true,  cond: 'good',     hostel: 'Hajveri', off: false, course: null, days: 15,  seller: 5  },
  { cat: 'electronics', title: 'Logitech C270 HD 720p Webcam',             desc: 'Good condition. Used for online lectures only. Works on Windows and Linux out of the box.', price: 3500,   neg: false, cond: 'good',     hostel: 'Zakria', off: false, course: null, days: 9,   seller: 6  },
  { cat: 'electronics', title: 'Belkin 4-Socket Surge-Protected Extension', desc: 'New in box, never used. 1.8m cable, rated 13A. Surge protector built in. All sockets work.', price: 1200,   neg: false, cond: 'new',      hostel: 'Johar', off: false, course: null, days: 3,   seller: 7  },

  // ── Hostel Essentials ×15 ────────────────────────────────────────────────
  { cat: 'hostel_essentials', title: 'Anex AG-3059 Room Heater 2000W',         desc: 'Good working condition. Both heat settings functional. Safety tip-over switch intact.', price: 3500,   neg: true,  cond: 'good',     hostel: 'Ghazali', off: false, course: null, days: 58, seller: 0  },
  { cat: 'hostel_essentials', title: 'Anex AG-4043 Electric Kettle 1.5L',      desc: 'Like new. Boils in 3 minutes. Auto shut-off works. Cord wraps neatly. Selling on departure.', price: 1800,   neg: false, cond: 'like_new', hostel: 'Razi', off: false, course: null, days: 52, seller: 1  },
  { cat: 'hostel_essentials', title: 'Philips GC1426 Dry Iron 1000W',          desc: 'Good condition, sole plate clean. Heats up quickly. No steam function — simple and reliable.', price: 2000,   neg: false, cond: 'good',     hostel: 'Rahmat', off: false, course: null, days: 46, seller: 2  },
  { cat: 'hostel_essentials', title: 'Portable Table Fan 12-inch 3-Speed',     desc: 'Good working condition. All 3 speeds functional. Rotates 90 degrees. Compact for hostel use.', price: 1500,   neg: true,  cond: 'good',     hostel: 'Attar', off: false, course: null, days: 40, seller: 3  },
  { cat: 'hostel_essentials', title: 'Double Cotton Bedsheet Set (2 pillow)',   desc: 'Like new, washed twice only. White with blue border. Fits standard hostel double bed.', price: 1200,   neg: false, cond: 'like_new', hostel: 'Liaquat', off: false, course: null, days: 35, seller: 4  },
  { cat: 'hostel_essentials', title: 'Foam Pillow Pair Standard Size',         desc: 'Good condition, no stains. Medium firmness. Used one semester. Clean and dust-free.', price: 600,    neg: false, cond: 'good',     hostel: 'Hajveri', off: false, course: null, days: 30, seller: 5  },
  { cat: 'hostel_essentials', title: 'Polyester Winter Blanket Double Size',   desc: 'Good condition. Warm enough for Islamabad winters. Washed and ready. No holes or tears.', price: 1500,   neg: true,  cond: 'good',     hostel: 'Zakria', off: false, course: null, days: 25, seller: 6  },
  { cat: 'hostel_essentials', title: 'Haier HR-116 Mini Refrigerator 3.2 Cu', desc: 'Good working condition. Cools well. Minor scratch on door. Power cable included. Must-have.', price: 14000,  neg: true,  cond: 'good',     hostel: 'Johar', off: false, course: null, days: 20, seller: 7  },
  { cat: 'hostel_essentials', title: 'Foldable Clothes Drying Rack Steel',     desc: 'New, only assembled once. 12 rails, holds a full load. Folds flat for storage under bed.', price: 800,    neg: false, cond: 'new',      hostel: 'Fatima', off: false, course: null, days: 16, seller: 10 },
  { cat: 'hostel_essentials', title: '6-Socket Extension Board 3m Heavy-duty', desc: 'Like new. All sockets work. 3-metre cable reaches across most hostel rooms comfortably.', price: 700,    neg: false, cond: 'like_new', hostel: 'Amna', off: false, course: null, days: 13, seller: 11 },
  { cat: 'hostel_essentials', title: 'LED Desk Study Lamp USB + Switch',       desc: 'Good condition. 3 brightness levels. USB-A powered. Adjustable neck. Eye-care mode active.', price: 1000,   neg: false, cond: 'good',     hostel: 'Khadija', off: false, course: null, days: 10, seller: 12 },
  { cat: 'hostel_essentials', title: 'Blackout Curtain Pair 140x200cm',        desc: 'Good condition, no fading. Blocks sunlight fully. Curtain hooks included. Off-white colour.', price: 900,    neg: true,  cond: 'good',     hostel: 'Fatima', off: false, course: null, days: 7,  seller: 26 },
  { cat: 'hostel_essentials', title: 'Stainless Steel Cooking Pot Set 2pc',    desc: 'Fair condition, surface staining but no dents or leaks. Lid fits both pots. Practical set.', price: 1200,   neg: true,  cond: 'fair',     hostel: 'Ghazali', off: false, course: null, days: 5,  seller: 15 },
  { cat: 'hostel_essentials', title: 'Anex AG-2027 Rice Cooker 1.5L',         desc: 'Good condition. Cooks rice and dal perfectly. Auto shut-off intact. Includes measuring cup.', price: 2500,   neg: false, cond: 'good',     hostel: 'Razi', off: false, course: null, days: 3,  seller: 16 },
  { cat: 'hostel_essentials', title: 'Round Wall Clock Quartz Silent',         desc: 'Like new. Silent sweep mechanism — no ticking sound. White face, 30cm. AA battery included.', price: 500,    neg: false, cond: 'like_new', hostel: 'Rahmat', off: false, course: null, days: 1,  seller: 17 },

  // ── Furniture ×10 ────────────────────────────────────────────────────────
  { cat: 'furniture', title: 'Wooden Study Table 4ft with Drawer',       desc: 'Good sturdy condition. One drawer with lock. Surface has minor scratches. Fits hostel rooms.', price: 5000,   neg: true,  cond: 'good', hostel: 'Attar', off: false, course: null, days: 19, seller: 3  },
  { cat: 'furniture', title: 'Revolving Office Chair with Cushion',       desc: 'Good condition. Height adjustable, back support intact. One wheel slightly stiff but works.', price: 4500,   neg: true,  cond: 'good', hostel: 'Liaquat', off: false, course: null, days: 17, seller: 4  },
  { cat: 'furniture', title: '3-Shelf Bookcase Pine Wood 180cm',          desc: 'Fair condition. Holds 60–80 books comfortably. Two shelves have minor watermarks on edge.', price: 2500,   neg: true,  cond: 'fair', hostel: 'Hajveri', off: false, course: null, days: 15, seller: 5  },
  { cat: 'furniture', title: 'Single High-Density Foam Mattress 6-inch',  desc: 'Good condition. Used 2 semesters. No sagging or odour. Vacuum-bagged for transport if needed.', price: 3500,   neg: true,  cond: 'good', hostel: 'Zakria', off: false, course: null, days: 13, seller: 6  },
  { cat: 'furniture', title: '5-Tier Metal Storage Rack 180x45x30cm',     desc: 'Good condition. All tiers level. Holds 25kg per shelf. Ideal for books and hostel essentials.', price: 2000,   neg: false, cond: 'good', hostel: 'Johar', off: false, course: null, days: 11, seller: 7  },
  { cat: 'furniture', title: 'Portable Folding Table 4ft Plastic Top',    desc: 'Good condition. Folds in 30 seconds. Suitable for study or eating. Easy to carry on bus.', price: 1800,   neg: false, cond: 'good', hostel: 'Fatima', off: false, course: null, days: 9,  seller: 10 },
  { cat: 'furniture', title: '3-Drawer Storage Unit on Casters',          desc: 'Fair condition. Wheels roll smoothly. One drawer handle loose but functional. Repainted white.', price: 3000,   neg: true,  cond: 'fair', hostel: 'Amna', off: false, course: null, days: 7,  seller: 11 },
  { cat: 'furniture', title: 'Wooden Bedside Table with Cabinet',         desc: 'Good condition. One door cabinet with shelf inside. Fits beside any single hostel bed frame.', price: 1500,   neg: false, cond: 'good', hostel: 'Khadija', off: false, course: null, days: 5,  seller: 12 },
  { cat: 'furniture', title: 'Floor Standing Adjustable Reading Lamp',    desc: 'Good condition. E27 bulb socket. Head rotates 270 degrees. Cord 1.8m with inline switch.', price: 1200,   neg: false, cond: 'good', hostel: 'Fatima', off: false, course: null, days: 3,  seller: 26 },
  { cat: 'furniture', title: 'Corkboard Notice Board 60×40cm with Frame', desc: 'Like new. Used for pinning notes and timetables. Includes 20 pins. Mounting screws included.', price: 600,    neg: false, cond: 'like_new', hostel: 'Ghazali', off: false, course: null, days: 1,  seller: 27 },

  // ── Bikes ×10 ────────────────────────────────────────────────────────────
  { cat: 'bikes', title: 'Atlas Cycle 26-inch Roadster Black',        desc: 'Good condition. Tires inflated, brakes responsive. Light rust on chain — easily oiled. Must-sell.', price: 9000,   neg: true,  cond: 'good',     hostel: 'Razi', off: false, course: null, days: 12, seller: 1  },
  { cat: 'bikes', title: 'Phoenix MTB 21-Speed 26-inch Blue',         desc: 'Like new. Used 6 months on campus. Gear shifters smooth. Comes with lock and rear carrier.', price: 14000,  neg: true,  cond: 'like_new', hostel: 'Rahmat', off: false, course: null, days: 10, seller: 2  },
  { cat: 'bikes', title: 'Chinese Roadster 20-inch Folding Cycle',    desc: 'Fair condition. Folds for storage. Front brake cable fraying — needs Rs 200 fix. Priced low.', price: 5500,   neg: true,  cond: 'fair',     hostel: 'Attar', off: false, course: null, days: 8,  seller: 3  },
  { cat: 'bikes', title: 'Honda CD-70 2020 Islamabad Registered',     desc: 'Good running condition. 2020 model, documents clear. Smooth engine, no oil leaks. Daily rider.', price: 78000,  neg: true,  cond: 'good',     hostel: 'Liaquat', off: false, course: null, days: 6,  seller: 4  },
  { cat: 'bikes', title: 'Suzuki GS-150 SE 2021 Self-Start',         desc: 'Like new. 12,000 km only, full service done. Islamabad registered, transfer easy. Urgent sale.', price: 115000, neg: true,  cond: 'like_new', hostel: null,  off: true,  course: null, days: 5,  seller: 18 },
  { cat: 'bikes', title: 'Ravi 70cc Loader Motorcycle',              desc: 'Fair condition. Runs fine, carries load. Suitable for grocery runs around sectors. Rawalpindi reg.', price: 42000,  neg: true,  cond: 'fair',     hostel: null,  off: true,  course: null, days: 4,  seller: 19 },
  { cat: 'bikes', title: 'Electric Scooter 48V (Needs New Battery)',  desc: 'Fair, all electrics work except old battery holds 5km charge only. New battery costs ~Rs 8,000.', price: 22000,  neg: true,  cond: 'fair',     hostel: 'Hajveri', off: false, course: null, days: 3,  seller: 5  },
  { cat: 'bikes', title: 'Kryptonite Chain Bicycle Lock 90cm',        desc: 'Good condition. 4-digit combination. Hardened steel chain. Fits frame and wheel together.', price: 800,    neg: false, cond: 'good',     hostel: 'Zakria', off: false, course: null, days: 2,  seller: 6  },
  { cat: 'bikes', title: 'Full-Face Bicycle Helmet Size M-L',         desc: 'Good condition. Chin guard and visor intact. Fits 56–60cm head. Certified impact protection.', price: 1500,   neg: false, cond: 'good',     hostel: 'Johar', off: false, course: null, days: 1,  seller: 7  },
  { cat: 'bikes', title: 'Bicycle Repair Toolkit 15-Piece Set',       desc: 'New in bag. Includes Allen keys, tyre levers, patch kit, spoke wrench, and chain tool.', price: 600,    neg: false, cond: 'new',      hostel: 'Fatima', off: false, course: null, days: 1,  seller: 10 },

  // ── Other ×5 ─────────────────────────────────────────────────────────────
  { cat: 'other', title: 'HP DeskJet 2130 All-in-One Printer',       desc: 'Fair condition. Prints and scans. Ink cartridges half-full. Occasional paper jam — fixable.', price: 8500,   neg: true,  cond: 'fair', hostel: 'Razi', off: false, course: null, days: 5, seller: 1  },
  { cat: 'other', title: 'Dawlance Microwave Oven DW-374 25L',        desc: 'Good condition. All power levels functional. Interior clean. Moving out so must sell this week.', price: 12000,  neg: true,  cond: 'good', hostel: null,  off: true,  course: null, days: 4, seller: 14 },
  { cat: 'other', title: 'A2 Drawing Board with Parallel Motion Bar', desc: 'Good condition. Parallel bar slides smoothly. Suitable for architecture and civil drawing courses.', price: 1500,   neg: true,  cond: 'good', hostel: 'Rahmat', off: false, course: null, days: 3, seller: 2  },
  { cat: 'other', title: 'Heavy-Duty Laundry Bag XL Waterproof',      desc: 'New, never used. Holds a full week of laundry. Double zip, shoulder strap included.', price: 400,    neg: false, cond: 'new',  hostel: 'Attar', off: false, course: null, days: 2, seller: 3  },
  { cat: 'other', title: 'Steel Clothes Hanger Set 20 Pieces Anti-Rust', desc: 'New in pack. Slim non-slip design. Suitable for shirts, trousers, and jackets. Rust-resistant.', price: 300,    neg: false, cond: 'new',  hostel: 'Liaquat', off: false, course: null, days: 1, seller: 4  },
];

// ── offers ────────────────────────────────────────────────────────────────────
// li: index into listingRows (matches LISTINGS array order, sorted by listing_id ASC)
// pct: proposed_price = round(listing.price * pct)
// bShift: buyerId = studentIds[(sellerStudentIdx + bShift) % studentIds.length]
// oDays: how many days ago the offer was created
// Indices 0-19 are 'accepted' → become the 20 transactions
const OFFER_SPECS = [
  // ACCEPTED (20) — first 13 → completed txns, next 4 → pending_completion, last 3 → cancelled txns
  { li:  0, pct: 0.90, bShift:  3, st: 'accepted', oDays: 155, msg: "Can we meet near H-1? Need this book urgently for exam prep." },
  { li:  1, pct: 0.85, bShift:  4, st: 'accepted', oDays: 145, msg: "Is price negotiable? Will take it at 500." },
  { li:  2, pct: 0.95, bShift:  5, st: 'accepted', oDays: 138, msg: "Looks like new. Ready to buy at asking price." },
  { li:  3, pct: 0.88, bShift:  6, st: 'accepted', oDays: 128, msg: "I can pick up from H-4 whenever suits you." },
  { li:  4, pct: 0.92, bShift:  7, st: 'accepted', oDays: 118, msg: "Starting Circuits next week, need this ASAP!" },
  { li:  5, pct: 0.80, bShift:  8, st: 'accepted', oDays: 108, msg: "My copy got damaged in the rain. Taking yours." },
  { li:  6, pct: 0.87, bShift:  9, st: 'accepted', oDays:  98, msg: "Offering Rs 390 final. Can meet at any hostel today." },
  { li:  7, pct: 0.93, bShift: 10, st: 'accepted', oDays:  88, msg: "Fair price offered. Let me know when to collect." },
  { li:  8, pct: 0.82, bShift: 11, st: 'accepted', oDays:  78, msg: "Finally found a copy! Price accepted, when can we meet?" },
  { li:  9, pct: 0.91, bShift: 12, st: 'accepted', oDays:  68, msg: "I can pay cash at H-8 gate any time this week." },
  { li: 10, pct: 0.85, bShift: 13, st: 'accepted', oDays:  58, msg: "Can we do 255? That is all I have in budget right now." },
  { li: 11, pct: 0.90, bShift: 14, st: 'accepted', oDays:  48, msg: "Need this for tomorrow's DS assignment urgently!" },
  { li: 12, pct: 0.88, bShift: 15, st: 'accepted', oDays:  38, msg: "Solution manual included makes this a great deal." },
  { li: 13, pct: 0.92, bShift:  3, st: 'accepted', oDays:  28, msg: "Let me know when to come collect. Price is fair." },
  { li: 14, pct: 0.86, bShift:  4, st: 'accepted', oDays:  18, msg: "Confirmed! Will come tomorrow evening to collect." },
  { li: 15, pct: 0.94, bShift:  5, st: 'accepted', oDays:  14, msg: "My roommate said ok too. Meet at ABB atrium?" },
  { li: 16, pct: 0.89, bShift:  6, st: 'accepted', oDays:   8, msg: "Interested! What time works for you to meet?" },
  { li: 17, pct: 0.83, bShift:  7, st: 'accepted', oDays:   5, msg: "Taking it. Send me your WhatsApp number please." },
  { li: 18, pct: 0.87, bShift:  8, st: 'accepted', oDays:   4, msg: "Reasonable price. Please respond soon." },
  { li: 19, pct: 0.91, bShift:  9, st: 'accepted', oDays:   3, msg: "Need before Friday, can we meet tomorrow?" },
  // PENDING (10)
  { li: 20, pct: 0.75, bShift:  2, st: 'pending',  oDays:   1, msg: "Is this still available? Looking for a spare monitor." },
  { li: 21, pct: 0.80, bShift:  3, st: 'pending',  oDays:   1, msg: "Does the charger work properly? Any port issues?" },
  { li: 22, pct: 0.78, bShift:  4, st: 'pending',  oDays:   1, msg: "I can meet at Cafeteria tomorrow. Final price?" },
  { li: 23, pct: 0.85, bShift:  5, st: 'pending',  oDays:   0, msg: "Interested but could you bring the price down slightly?" },
  { li: 24, pct: 0.82, bShift:  6, st: 'pending',  oDays:   0, msg: "Can I inspect before buying? Available at H-5." },
  { li: 25, pct: 0.90, bShift:  7, st: 'pending',  oDays:   0, msg: "Do you have more pictures of the condition?" },
  { li: 26, pct: 0.77, bShift:  8, st: 'pending',  oDays:   0, msg: "What is the battery health on this power bank?" },
  { li: 27, pct: 0.83, bShift:  9, st: 'pending',  oDays:   0, msg: "Can the price come down a bit? Budget is tight." },
  { li: 28, pct: 0.88, bShift: 10, st: 'pending',  oDays:   0, msg: "Willing to pay cash today if still available." },
  { li: 29, pct: 0.76, bShift: 11, st: 'pending',  oDays:   0, msg: "Will you consider a slightly lower price for earphones?" },
  // REJECTED (7) — low-ball offers sellers turned down
  { li: 30, pct: 0.55, bShift:  2, st: 'rejected', oDays:  40, msg: "Would you take half the listed price? That is my budget." },
  { li: 31, pct: 0.60, bShift:  3, st: 'rejected', oDays:  35, msg: "The price is too high for a used item. Can you go much lower?" },
  { li: 32, pct: 0.50, bShift:  4, st: 'rejected', oDays:  30, msg: "I can only afford 60 percent of listed price. Final offer." },
  { li: 33, pct: 0.65, bShift:  5, st: 'rejected', oDays:  20, msg: "Offering significantly below asking price, take it or leave." },
  { li: 34, pct: 0.58, bShift:  6, st: 'rejected', oDays:  15, msg: "Your price is too high for this condition." },
  { li: 35, pct: 0.62, bShift:  7, st: 'rejected', oDays:  10, msg: "I will give 60 percent of asking, no higher." },
  { li: 36, pct: 0.68, bShift:  8, st: 'rejected', oDays:   5, msg: "Would you consider a swap/exchange deal instead of cash?" },
  // CANCELLED (3) — buyer backed out
  { li: 37, pct: 0.85, bShift:  2, st: 'cancelled', oDays: 12, msg: "Interested! Will come to inspect tomorrow." },
  { li: 38, pct: 0.80, bShift:  3, st: 'cancelled', oDays:  8, msg: "Price seems ok. Can we talk details?" },
  { li: 39, pct: 0.92, bShift:  4, st: 'cancelled', oDays:  6, msg: "Can you hold it for me till Saturday?" },
];

// ── transactions ──────────────────────────────────────────────────────────────
// oi: index into OFFER_SPECS (must be an accepted offer, i.e. 0–19)
// st: transaction_status_enum value
// compDaysAgo: for 'completed' — days ago the transaction was completed
const TX_SPECS = [
  { oi:  0, st: 'completed',          compDaysAgo: 148 },
  { oi:  1, st: 'completed',          compDaysAgo: 138 },
  { oi:  2, st: 'completed',          compDaysAgo: 131 },
  { oi:  3, st: 'completed',          compDaysAgo: 121 },
  { oi:  4, st: 'completed',          compDaysAgo: 111 },
  { oi:  5, st: 'completed',          compDaysAgo: 101 },
  { oi:  6, st: 'completed',          compDaysAgo:  91 },
  { oi:  7, st: 'completed',          compDaysAgo:  81 },
  { oi:  8, st: 'completed',          compDaysAgo:  71 },
  { oi:  9, st: 'completed',          compDaysAgo:  61 },
  { oi: 10, st: 'completed',          compDaysAgo:  51 },
  { oi: 11, st: 'completed',          compDaysAgo:  41 },
  { oi: 12, st: 'completed',          compDaysAgo:  31 },
  { oi: 13, st: 'pending_completion', compDaysAgo: null },
  { oi: 14, st: 'pending_completion', compDaysAgo: null },
  { oi: 15, st: 'pending_completion', compDaysAgo: null },
  { oi: 16, st: 'pending_completion', compDaysAgo: null },
  { oi: 17, st: 'cancelled_by_buyer', compDaysAgo: null },
  { oi: 18, st: 'cancelled_by_buyer', compDaysAgo: null },
  { oi: 19, st: 'cancelled_by_buyer', compDaysAgo: null },
];

// ── reviews ───────────────────────────────────────────────────────────────────
// ti: index into the completedTxs array built during seeding (maps to TX_SPECS[0-12])
// by: 'buyer' | 'seller' — determines reviewer_id / reviewee_id
// TX_SPECS[0-11]: double-reviewed (buyer + seller) = 24 reviews
// TX_SPECS[12]:   single review (buyer only)       =  1 review
//                                                    ─────────
//                                                    25 total
const REVIEW_SPECS = [
  { ti:  0, by: 'buyer',  rating: 5, comment: "Great seller! Book exactly as described, no missing pages. Quick exchange outside H-1." },
  { ti:  0, by: 'seller', rating: 4, comment: "Good buyer, paid on time without any issue. Smooth handover." },
  { ti:  1, by: 'buyer',  rating: 4, comment: "Honest seller. Condition was accurate. Got it at a fair price." },
  { ti:  1, by: 'seller', rating: 5, comment: "Reliable buyer. Showed up on time and paid the exact agreed amount." },
  { ti:  2, by: 'buyer',  rating: 5, comment: "Like new as advertised. Seller was helpful and punctual at H-3." },
  { ti:  2, by: 'seller', rating: 5, comment: "Quick deal. Buyer inspected and paid cash same day. Highly recommend." },
  { ti:  3, by: 'buyer',  rating: 4, comment: "Slightly more highlighting than expected but honestly priced. No complaints." },
  { ti:  3, by: 'seller', rating: 4, comment: "Friendly buyer. Easy pickup near H-4, no trouble at all." },
  { ti:  4, by: 'buyer',  rating: 4, comment: "Spine intact as described. Worth the price for CS-301 course." },
  { ti:  4, by: 'seller', rating: 5, comment: "Smooth transaction. Buyer was polite and arrived on time." },
  { ti:  5, by: 'buyer',  rating: 3, comment: "Condition was fair as described. Took a few tries to coordinate the meeting." },
  { ti:  5, by: 'seller', rating: 3, comment: "Buyer was slow to finalize the meeting spot but deal went through." },
  { ti:  6, by: 'buyer',  rating: 4, comment: "Good condition as listed. Quick and easy exchange at H-7 gate." },
  { ti:  6, by: 'seller', rating: 5, comment: "Buyer arrived exactly on time and paid cash immediately. Top experience." },
  { ti:  7, by: 'buyer',  rating: 5, comment: "Literally like new! Seller was honest and the handover was quick." },
  { ti:  7, by: 'seller', rating: 5, comment: "Very cooperative buyer, minimal back-and-forth. Would deal again." },
  { ti:  8, by: 'buyer',  rating: 5, comment: "Clean copy plus solution manual as promised. Very happy with this purchase." },
  { ti:  8, by: 'seller', rating: 4, comment: "Buyer was satisfied and paid promptly. Good experience overall." },
  { ti:  9, by: 'buyer',  rating: 4, comment: "Pencil marks easily erasable as mentioned. Fair deal for PHY-101." },
  { ti:  9, by: 'seller', rating: 4, comment: "Buyer negotiated politely and honoured the agreed price. Recommended." },
  { ti: 10, by: 'buyer',  rating: 5, comment: "Saved hours of note-taking. Excellent handwritten notes, seller very helpful." },
  { ti: 10, by: 'seller', rating: 5, comment: "Smooth online-to-pickup deal. Buyer was organized and quick to collect." },
  { ti: 11, by: 'buyer',  rating: 4, comment: "All chapters present and readable. Seller was honest about the condition." },
  { ti: 11, by: 'seller', rating: 5, comment: "Buyer came exactly on time with no price re-negotiation. Perfect." },
  { ti: 12, by: 'buyer',  rating: 5, comment: "Like new as advertised! Dragon Book in pristine condition. Excellent seller." },
];

// ── wishlist ──────────────────────────────────────────────────────────────────
// user: STUDENTS array index (the person saving the listing)
// li:   LISTINGS array index (the listing being saved)
// Constraint: user must not be the listing's seller (avoids self-wishlisting)
const WISHLIST_SPECS = [
  { user:  1, li: 20 },  // usman → Dell Latitude (seller: 0 ali)
  { user:  2, li: 21 },  // bilal → HP EliteBook (seller: 1 usman)
  { user:  0, li: 22 },  // ali → Samsung A32 (seller: 2 bilal)
  { user:  4, li: 23 },  // saad → Realme Narzo (seller: 3 hamza)
  { user:  3, li: 24 },  // hamza → Casio FX-991ES (seller: 4 saad)
  { user:  0, li: 25 },  // ali → MacBook Air M1 (seller: 5 omer)
  { user:  1, li: 26 },  // usman → Cooling Pad (seller: 6 zain)
  { user:  2, li: 27 },  // bilal → USB-C Hub (seller: 7 fahad)
  { user:  5, li: 28 },  // omer → Logitech Mouse (seller: 10 sana)
  { user:  6, li: 29 },  // zain → HDMI Cable (seller: 11 maria)
  { user:  7, li: 30 },  // fahad → WD HDD 1TB (seller: 12 hira)
  { user:  8, li: 31 },  // ahmed → Anker PowerBank (seller: 26 junaid)
  { user:  9, li: 32 },  // talha → JBL Earphones (seller: 15 danish)
  { user: 10, li: 33 },  // sana → Sony Headphones (seller: 16 faisal)
  { user: 11, li: 34 },  // maria → Flexible Tripod (seller: 17 asim)
  { user: 12, li: 36 },  // hira → Redragon Keyboard (seller: 4 saad)
  { user: 13, li: 37 },  // nadia → Samsung Monitor (seller: 5 omer)
  { user: 14, li: 38 },  // amna → Logitech Webcam (seller: 6 zain)
  { user: 15, li: 40 },  // danish → Anex Heater (seller: 0 ali)
  { user: 16, li: 41 },  // faisal → Anex Kettle (seller: 1 usman)
  { user: 17, li: 44 },  // asim → Double Bedsheet Set (seller: 4 saad)
  { user: 18, li: 47 },  // irfan → Haier Mini Fridge (seller: 7 fahad)
  { user: 19, li: 50 },  // shahid → LED Desk Lamp (seller: 12 hira)
  { user: 20, li: 55 },  // kashif → Wooden Study Table (seller: 3 hamza)
  { user: 21, li: 58 },  // imran → Single Mattress (seller: 6 zain)
  { user: 22, li: 65 },  // naveed → Atlas Cycle 26" (seller: 1 usman)
  { user: 23, li: 66 },  // waseem → Phoenix MTB 21-Speed (seller: 2 bilal)
  { user: 24, li: 68 },  // tariq → Honda CD-70 (seller: 4 saad)
  { user: 25, li: 69 },  // rizwan → Suzuki GS-150 (seller: 18 irfan)
  { user: 26, li: 75 },  // junaid → HP DeskJet Printer (seller: 1 usman)
];

// ── saved searches ────────────────────────────────────────────────────────────
// user: STUDENTS array index
// filters: stored as JSONB — matches the query filter keys the API accepts
const SAVED_SEARCH_SPECS = [
  { user:  0, name: 'Cheap Laptops',        query: 'laptop',      filters: { category: 'electronics', max_price: 50000 } },
  { user:  1, name: 'CS Textbooks',         query: 'CS',          filters: { category: 'books' } },
  { user:  2, name: 'Honda Bike',           query: 'honda',       filters: { category: 'bikes', max_price: 90000 } },
  { user:  3, name: 'Hostel Heaters',       query: 'heater',      filters: { category: 'hostel_essentials', max_price: 5000 } },
  { user:  4, name: 'Study Furniture',      query: 'study table', filters: { category: 'furniture', max_price: 7000 } },
  { user:  5, name: 'ADBMS Textbook',       query: 'CS-236',      filters: { category: 'books' } },
  { user:  6, name: 'Like-New Electronics', query: '',            filters: { category: 'electronics', condition: 'like_new' } },
  { user:  7, name: 'H-8 Items',            query: '',            filters: { hostel: 'Johar' } },
  { user:  8, name: 'Calculators',          query: 'calculator',  filters: { category: 'electronics', max_price: 3000 } },
  { user:  9, name: 'EE Books Under 800',   query: 'EE',          filters: { category: 'books', max_price: 800 } },
];

// ── notifications (MongoDB) ───────────────────────────────────────────────────
// rec:  STUDENTS array index (the recipient user)
// type: notification type string
// days: how many days ago created_at is set
// read: if true, read_at is set to (created_at + 1 day); null otherwise
// payload: context attached to the notification (no live Postgres IDs needed for demo)
const NOTIF_SPECS = [
  // ── new_offer (20) — sellers notified when buyer makes an offer ──
  { rec:  0, type: 'new_offer', days: 155, read: true,  payload: { listing_title: 'CS-101 Intro to Programming Deitel 10th Ed', proposed_price: 450,   buyer_name: 'Hamza Khan'     } },
  { rec:  1, type: 'new_offer', days: 145, read: true,  payload: { listing_title: 'CS-201 Data Structures — Mark Allen Weiss',  proposed_price: 510,   buyer_name: 'Saad Tariq'     } },
  { rec:  2, type: 'new_offer', days: 138, read: true,  payload: { listing_title: 'CS-236 Advanced Database Systems',           proposed_price: 665,   buyer_name: 'Omer Farooq'    } },
  { rec:  3, type: 'new_offer', days: 128, read: true,  payload: { listing_title: 'CS-251 Operating Systems Silberschatz',     proposed_price: 484,   buyer_name: 'Zain Ali'       } },
  { rec:  4, type: 'new_offer', days: 118, read: true,  payload: { listing_title: 'CS-301 Computer Networks Tanenbaum',        proposed_price: 552,   buyer_name: 'Fahad Siddiqui' } },
  { rec:  5, type: 'new_offer', days: 108, read: true,  payload: { listing_title: 'CS-345 Software Engineering Sommerville',   proposed_price: 400,   buyer_name: 'Ahmed Raza'     } },
  { rec:  6, type: 'new_offer', days:  98, read: true,  payload: { listing_title: 'EE-101 Circuits and Electronics Nilsson',   proposed_price: 392,   buyer_name: 'Talha Butt'     } },
  { rec:  7, type: 'new_offer', days:  88, read: true,  payload: { listing_title: 'MATH-101 Calculus Early Transcendentals',  proposed_price: 651,   buyer_name: 'Sana Iqbal'     } },
  { rec: 10, type: 'new_offer', days:  78, read: true,  payload: { listing_title: 'MATH-201 Linear Algebra Gilbert Strang',    proposed_price: 533,   buyer_name: 'Maria Aslam'    } },
  { rec: 11, type: 'new_offer', days:  68, read: true,  payload: { listing_title: 'PHY-101 University Physics Sears Vol 1',   proposed_price: 501,   buyer_name: 'Hira Jamil'     } },
  { rec:  8, type: 'new_offer', days:  58, read: false, payload: { listing_title: 'ENGL-104 Technical Writing for Engineers', proposed_price: 255,   buyer_name: 'Nadia Sheikh'   } },
  { rec: 15, type: 'new_offer', days:  48, read: false, payload: { listing_title: 'CS-201 Discrete Mathematics Rosen 7th Ed', proposed_price: 450,   buyer_name: 'Amna Akhtar'    } },
  { rec: 16, type: 'new_offer', days:  38, read: false, payload: { listing_title: 'CS-401 Compiler Design Dragon Book 2nd Ed',proposed_price: 660,   buyer_name: 'Danish Qureshi' } },
  { rec:  2, type: 'new_offer', days:  28, read: false, payload: { listing_title: 'CS-460 Artificial Intelligence Russell',   proposed_price: 819,   buyer_name: 'Faisal Mehmood' } },
  { rec: 20, type: 'new_offer', days:  18, read: false, payload: { listing_title: 'HU-101 Engineering Economics Newman',      proposed_price: 344,   buyer_name: 'Asim Nawaz'     } },
  { rec: 21, type: 'new_offer', days:  14, read: false, payload: { listing_title: 'ME-201 Thermodynamics Cengel & Boles',    proposed_price: 564,   buyer_name: 'Irfan Cheema'   } },
  { rec:  5, type: 'new_offer', days:   8, read: false, payload: { listing_title: 'EE-201 Signals and Systems Oppenheim',    proposed_price: 623,   buyer_name: 'Shahid Hussain' } },
  { rec:  6, type: 'new_offer', days:   5, read: false, payload: { listing_title: 'EE-202 Digital Logic Design Floyd 10th',  proposed_price: 457,   buyer_name: 'Kashif Anwar'   } },
  { rec:  5, type: 'new_offer', days:   4, read: false, payload: { listing_title: 'Dell Latitude 5490 Core i5',              proposed_price: 33060, buyer_name: 'Imran Baig'     } },
  { rec:  1, type: 'new_offer', days:   3, read: false, payload: { listing_title: 'HP EliteBook 840 Core i7',               proposed_price: 46750, buyer_name: 'Naveed Sultan'  } },

  // ── offer_accepted (10) — buyers notified when seller accepts ──
  { rec:  3, type: 'offer_accepted', days: 155, read: true,  payload: { listing_title: 'CS-101 Intro to Programming Deitel 10th Ed', agreed_price: 450,  seller_name: 'Ali Hassan'     } },
  { rec:  4, type: 'offer_accepted', days: 145, read: true,  payload: { listing_title: 'CS-201 Data Structures — Mark Allen Weiss',  agreed_price: 510,  seller_name: 'Usman Malik'    } },
  { rec:  5, type: 'offer_accepted', days: 138, read: true,  payload: { listing_title: 'CS-236 Advanced Database Systems',           agreed_price: 665,  seller_name: 'Bilal Ahmed'    } },
  { rec:  6, type: 'offer_accepted', days: 128, read: true,  payload: { listing_title: 'CS-251 Operating Systems Silberschatz',     agreed_price: 484,  seller_name: 'Hamza Khan'     } },
  { rec:  7, type: 'offer_accepted', days: 118, read: true,  payload: { listing_title: 'CS-301 Computer Networks Tanenbaum',        agreed_price: 552,  seller_name: 'Saad Tariq'     } },
  { rec:  8, type: 'offer_accepted', days: 108, read: true,  payload: { listing_title: 'CS-345 Software Engineering Sommerville',   agreed_price: 400,  seller_name: 'Omer Farooq'    } },
  { rec:  9, type: 'offer_accepted', days:  98, read: false, payload: { listing_title: 'EE-101 Circuits and Electronics Nilsson',   agreed_price: 392,  seller_name: 'Zain Ali'       } },
  { rec: 10, type: 'offer_accepted', days:  88, read: false, payload: { listing_title: 'MATH-101 Calculus Early Transcendentals',  agreed_price: 651,  seller_name: 'Fahad Siddiqui' } },
  { rec: 11, type: 'offer_accepted', days:  78, read: false, payload: { listing_title: 'MATH-201 Linear Algebra Gilbert Strang',    agreed_price: 533,  seller_name: 'Ali Hassan'     } },
  { rec: 12, type: 'offer_accepted', days:  68, read: false, payload: { listing_title: 'PHY-101 University Physics Sears Vol 1',   agreed_price: 501,  seller_name: 'Usman Malik'    } },

  // ── offer_rejected (5) — buyers notified when seller rejects ──
  { rec:  2, type: 'offer_rejected', days:  40, read: true,  payload: { listing_title: 'HP DeskJet 2130 All-in-One Printer',        rejected_price: 4675, seller_name: 'Usman Malik'  } },
  { rec:  3, type: 'offer_rejected', days:  35, read: true,  payload: { listing_title: 'Dawlance Microwave Oven DW-374 25L',        rejected_price: 7200, seller_name: 'Amna Akhtar'  } },
  { rec:  4, type: 'offer_rejected', days:  30, read: false, payload: { listing_title: 'A2 Drawing Board with Parallel Motion Bar', rejected_price: 750,  seller_name: 'Bilal Ahmed'  } },
  { rec:  5, type: 'offer_rejected', days:  20, read: false, payload: { listing_title: 'Heavy-Duty Laundry Bag XL Waterproof',      rejected_price: 260,  seller_name: 'Hamza Khan'   } },
  { rec:  6, type: 'offer_rejected', days:  15, read: false, payload: { listing_title: 'Steel Clothes Hanger Set 20 Pieces',        rejected_price: 174,  seller_name: 'Saad Tariq'   } },

  // ── transaction_completed (8) — buyer and seller both notified ──
  { rec:  3, type: 'transaction_completed', days: 148, read: true,  payload: { listing_title: 'CS-101 Intro to Programming Deitel 10th Ed', final_price: 450,  role: 'buyer'  } },
  { rec:  0, type: 'transaction_completed', days: 148, read: true,  payload: { listing_title: 'CS-101 Intro to Programming Deitel 10th Ed', final_price: 450,  role: 'seller' } },
  { rec:  4, type: 'transaction_completed', days: 138, read: true,  payload: { listing_title: 'CS-201 Data Structures — Mark Allen Weiss',  final_price: 510,  role: 'buyer'  } },
  { rec:  1, type: 'transaction_completed', days: 138, read: true,  payload: { listing_title: 'CS-201 Data Structures — Mark Allen Weiss',  final_price: 510,  role: 'seller' } },
  { rec:  5, type: 'transaction_completed', days:  81, read: true,  payload: { listing_title: 'MATH-101 Calculus Early Transcendentals',   final_price: 651,  role: 'buyer'  } },
  { rec:  7, type: 'transaction_completed', days:  81, read: false, payload: { listing_title: 'MATH-101 Calculus Early Transcendentals',   final_price: 651,  role: 'seller' } },
  { rec:  8, type: 'transaction_completed', days:  51, read: false, payload: { listing_title: 'ENGL-104 Technical Writing for Engineers',  final_price: 255,  role: 'buyer'  } },
  { rec: 13, type: 'transaction_completed', days:  41, read: false, payload: { listing_title: 'CS-201 Discrete Mathematics Rosen 7th Ed',  final_price: 450,  role: 'buyer'  } },

  // ── review_received (4) — reviewee notified after review posted ──
  { rec:  0, type: 'review_received', days: 147, read: true,  payload: { reviewer_name: 'Hamza Khan',    rating: 5, comment_preview: 'Great seller! Book exactly as described...'    } },
  { rec:  3, type: 'review_received', days: 147, read: true,  payload: { reviewer_name: 'Ali Hassan',    rating: 4, comment_preview: 'Good buyer, paid on time without any issue.'   } },
  { rec:  1, type: 'review_received', days: 137, read: false, payload: { reviewer_name: 'Saad Tariq',    rating: 4, comment_preview: 'Honest seller. Condition was accurate.'        } },
  { rec: 15, type: 'review_received', days:  40, read: false, payload: { reviewer_name: 'Nadia Sheikh',  rating: 5, comment_preview: 'Saved hours of note-taking. Excellent notes.'  } },

  // ── price_drop (3) — wishlist owners notified when seller lowers price ──
  { rec:  1, type: 'price_drop', days:  2, read: false, payload: { listing_title: 'Dell Latitude 5490 Core i5 8GB 256GB SSD', old_price: 38000, new_price: 35000 } },
  { rec:  5, type: 'price_drop', days:  1, read: false, payload: { listing_title: 'Apple MacBook Air M1 8GB 256GB',          old_price: 72000, new_price: 68000 } },
  { rec: 13, type: 'price_drop', days:  1, read: false, payload: { listing_title: 'Samsung 22-inch Full HD 1080p Monitor',   old_price: 12000, new_price: 10500 } },
];

// ── seed function ─────────────────────────────────────────────────────────────
const seed = async () => {
  // Connect to MongoDB before PG transaction so we can check notif count
  const mongoClient = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoClient.connect();
  const mongoDb = mongoClient.db(new URL(process.env.MONGO_URI).pathname.replace('/', ''));

  const client = await pool.connect();
  try {
    const { rows: [cnt] } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users)          AS ucount,
        (SELECT COUNT(*)::int FROM listings)       AS lcount,
        (SELECT COUNT(*)::int FROM offers)         AS ocount,
        (SELECT COUNT(*)::int FROM wishlist_items) AS wcount,
        (SELECT COUNT(*)::int FROM saved_searches) AS sscount
    `);

    const notifCount = await mongoDb.collection('notifications').countDocuments({});

    const needUsers         = cnt.ucount  <= 5;
    const needListings      = cnt.lcount  <= 50;
    const needOffers        = cnt.ocount  < 40;
    const needWishlist      = cnt.wcount  < 30;
    const needSavedSearches = cnt.sscount < 10;
    const needNotifs        = notifCount  < 50;

    if (!needUsers && !needListings && !needOffers && !needWishlist && !needSavedSearches && !needNotifs) {
      console.log(
        `[seed] already seeded (${cnt.ucount} users, ${cnt.lcount} listings, ` +
        `${cnt.ocount} offers, ${cnt.wcount} wishlist, ${cnt.sscount} saved searches, ` +
        `${notifCount} notifications) — exiting`
      );
      return;
    }

    let adminHash, studentHash;
    if (needUsers) {
      console.log('[seed] hashing passwords (bcrypt rounds=' + BCRYPT_ROUNDS + ')…');
      [adminHash, studentHash] = await Promise.all([
        bcrypt.hash('Admin@1234',   BCRYPT_ROUNDS),
        bcrypt.hash('Student@1234', BCRYPT_ROUNDS),
      ]);
    }

    await client.query('BEGIN');

    // ── phase 1: categories + users ──
    if (needUsers) {
      console.log('[seed] inserting categories…');
      for (const c of CATEGORIES) {
        await client.query(`
          INSERT INTO categories (slug, name, description, display_order)
          VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING
        `, [c.slug, c.name, c.desc, c.ord]);
      }

      console.log('[seed] inserting admin…');
      await client.query(`
        INSERT INTO users
          (email, password_hash, full_name, department, semester, residence_type, role, email_verified)
        VALUES ($1, $2, 'NUST Admin', 'SEECS', 1, 'day_scholar', 'admin', TRUE)
        ON CONFLICT (email) DO NOTHING
      `, ['admin@nust.edu.pk', adminHash]);

      console.log('[seed] inserting 30 students…');
      for (const s of STUDENTS) {
        await client.query(`
          INSERT INTO users
            (email, password_hash, full_name, department, semester,
             residence_type, hostel_name, role, email_verified)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'student', TRUE)
          ON CONFLICT (email) DO NOTHING
        `, [s.email, studentHash, s.name, s.dept, s.sem, s.res, s.hostel]);
      }
    }

    // Always fetch studentIds — needed for listings, offers, wishlist, notifications phases
    const { rows: studentRows } = await client.query(
      "SELECT user_id FROM users WHERE role = 'student' ORDER BY user_id ASC"
    );
    const studentIds = studentRows.map((r) => r.user_id);

    // ── phase 2: listings ──
    if (needListings) {
      const { rows: catRows } = await client.query('SELECT category_id, slug FROM categories');
      const catMap = Object.fromEntries(catRows.map((r) => [r.slug, r.category_id]));

      console.log('[seed] inserting 80 listings…');
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      for (const l of LISTINGS) {
        const sellerId  = studentIds[l.seller % studentIds.length];
        const catId     = catMap[l.cat];
        const postedAt  = new Date(now - l.days * MS_PER_DAY);
        // All listings expire 30 days from NOW so the demo feed is fully populated
        const expiresAt = new Date(now + 30 * MS_PER_DAY);

        await client.query(`
          INSERT INTO listings
            (seller_id, category_id, title, description, price, is_negotiable,
             condition, location_hostel, is_off_campus, course_code,
             posted_at, expires_at, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
        `, [
          sellerId, catId,
          l.title, l.desc,
          l.price, l.neg,
          l.cond, l.hostel, l.off, l.course,
          postedAt, expiresAt,
        ]);
      }
    }

    // ── phase 3: offers, transactions, reviews ──
    // Fetch listing rows if needed by offers or wishlist phases
    let listingRows = [];
    if (needOffers || needWishlist) {
      const { rows } = await client.query(
        'SELECT listing_id, seller_id, price FROM listings WHERE seller_id = ANY($1::int[]) ORDER BY listing_id ASC',
        [studentIds]
      );
      listingRows = rows;
    }

    if (needOffers) {
      console.log('[seed] inserting 40 offers…');
      const offerIdMap = {}; // OFFER_SPECS index → offer_id

      for (const [i, spec] of OFFER_SPECS.entries()) {
        const lr = listingRows[spec.li];
        const sellerStudentIdx = studentIds.indexOf(lr.seller_id);
        const buyerIdx  = (sellerStudentIdx + spec.bShift) % studentIds.length;
        const buyerId   = studentIds[buyerIdx];
        const proposed  = Math.round(lr.price * spec.pct);

        let sql, params;
        if (spec.st === 'pending') {
          sql = `
            INSERT INTO offers
              (listing_id, buyer_id, seller_id, proposed_price, message, status, created_at, expires_at)
            VALUES ($1,$2,$3,$4,$5,'pending',
              NOW() - ($6 * INTERVAL '1 day'),
              NOW() + INTERVAL '36 hours')
            RETURNING offer_id`;
          params = [lr.listing_id, buyerId, lr.seller_id, proposed, spec.msg, spec.oDays];
        } else if (spec.st === 'accepted') {
          sql = `
            INSERT INTO offers
              (listing_id, buyer_id, seller_id, proposed_price, message, status,
               created_at, expires_at, responded_at)
            VALUES ($1,$2,$3,$4,$5,'accepted',
              NOW() - ($6 * INTERVAL '1 day'),
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '48 hours',
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '6 hours')
            RETURNING offer_id`;
          params = [lr.listing_id, buyerId, lr.seller_id, proposed, spec.msg, spec.oDays];
        } else if (spec.st === 'rejected') {
          sql = `
            INSERT INTO offers
              (listing_id, buyer_id, seller_id, proposed_price, message, status,
               created_at, expires_at, responded_at)
            VALUES ($1,$2,$3,$4,$5,'rejected',
              NOW() - ($6 * INTERVAL '1 day'),
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '48 hours',
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '8 hours')
            RETURNING offer_id`;
          params = [lr.listing_id, buyerId, lr.seller_id, proposed, spec.msg, spec.oDays];
        } else { // cancelled
          sql = `
            INSERT INTO offers
              (listing_id, buyer_id, seller_id, proposed_price, message, status,
               created_at, expires_at)
            VALUES ($1,$2,$3,$4,$5,'cancelled',
              NOW() - ($6 * INTERVAL '1 day'),
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '48 hours')
            RETURNING offer_id`;
          params = [lr.listing_id, buyerId, lr.seller_id, proposed, spec.msg, spec.oDays];
        }

        const { rows } = await client.query(sql, params);
        offerIdMap[i] = rows[0].offer_id;
      }

      console.log('[seed] inserting 20 transactions…');
      // completedTxs[i] = { txId, buyerId, sellerId } — indexed same as TX_SPECS completed entries
      const completedTxs = [];

      for (const txSpec of TX_SPECS) {
        const offerSpec   = OFFER_SPECS[txSpec.oi];
        const offerId     = offerIdMap[txSpec.oi];
        const lr          = listingRows[offerSpec.li];
        const sellerIdx   = studentIds.indexOf(lr.seller_id);
        const buyerId     = studentIds[(sellerIdx + offerSpec.bShift) % studentIds.length];
        const sellerId    = lr.seller_id;
        const agreedPrice = Math.round(lr.price * offerSpec.pct);

        if (txSpec.st === 'completed') {
          const cd = txSpec.compDaysAgo;
          const { rows } = await client.query(`
            INSERT INTO transactions
              (listing_id, offer_id, buyer_id, seller_id, agreed_price, status,
               buyer_confirmed_at, seller_confirmed_at, completed_at, created_at)
            VALUES ($1,$2,$3,$4,$5,'completed',
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '22 hours',
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '23 hours',
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '24 hours',
              NOW() - ($6 * INTERVAL '1 day'))
            RETURNING transaction_id
          `, [lr.listing_id, offerId, buyerId, sellerId, agreedPrice, cd]);

          completedTxs.push({ txId: rows[0].transaction_id, buyerId, sellerId });

          // Mark listing sold; sold_at matches completed_at
          await client.query(`
            UPDATE listings
            SET status = 'sold',
                sold_at = NOW() - ($1 * INTERVAL '1 day') + INTERVAL '24 hours'
            WHERE listing_id = $2
          `, [cd, lr.listing_id]);

          await client.query(
            'UPDATE users SET total_sales     = total_sales     + 1 WHERE user_id = $1', [sellerId]
          );
          await client.query(
            'UPDATE users SET total_purchases = total_purchases + 1 WHERE user_id = $1', [buyerId]
          );

        } else if (txSpec.st === 'pending_completion') {
          await client.query(`
            INSERT INTO transactions
              (listing_id, offer_id, buyer_id, seller_id, agreed_price, status,
               buyer_confirmed_at, created_at)
            VALUES ($1,$2,$3,$4,$5,'pending_completion',
              NOW() - INTERVAL '6 hours',
              NOW() - ($6 * INTERVAL '1 day'))
          `, [lr.listing_id, offerId, buyerId, sellerId, agreedPrice, offerSpec.oDays - 1]);

          await client.query(
            "UPDATE listings SET status = 'reserved' WHERE listing_id = $1", [lr.listing_id]
          );

        } else { // cancelled_by_buyer
          await client.query(`
            INSERT INTO transactions
              (listing_id, offer_id, buyer_id, seller_id, agreed_price, status,
               cancelled_at, cancellation_reason, created_at)
            VALUES ($1,$2,$3,$4,$5,'cancelled_by_buyer',
              NOW() - ($6 * INTERVAL '1 day') + INTERVAL '36 hours',
              'Buyer did not show up for the scheduled pickup.',
              NOW() - ($6 * INTERVAL '1 day'))
          `, [lr.listing_id, offerId, buyerId, sellerId, agreedPrice, offerSpec.oDays - 1]);
        }
      }

      console.log('[seed] inserting 25 reviews…');
      for (const rev of REVIEW_SPECS) {
        const tx         = completedTxs[rev.ti];
        const reviewerId = rev.by === 'buyer' ? tx.buyerId  : tx.sellerId;
        const revieweeId = rev.by === 'buyer' ? tx.sellerId : tx.buyerId;

        await client.query(`
          INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating, comment)
          VALUES ($1,$2,$3,$4,$5)
        `, [tx.txId, reviewerId, revieweeId, rev.rating, rev.comment]);
      }
    }

    // ── phase 4: wishlist + saved searches ──
    if (needWishlist) {
      console.log('[seed] inserting 30 wishlist items…');
      for (const w of WISHLIST_SPECS) {
        const userId    = studentIds[w.user];
        const listingId = listingRows[w.li].listing_id;
        await client.query(
          'INSERT INTO wishlist_items (user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [userId, listingId]
        );
      }
    }

    if (needSavedSearches) {
      console.log('[seed] inserting 10 saved searches…');
      for (const s of SAVED_SEARCH_SPECS) {
        const userId = studentIds[s.user];
        await client.query(`
          INSERT INTO saved_searches (user_id, name, query_text, filters_json)
          VALUES ($1,$2,$3,$4)
        `, [userId, s.name, s.query, JSON.stringify(s.filters)]);
      }
    }

    await client.query('COMMIT');

    // ── phase 5: notifications (MongoDB — outside PG transaction) ──
    if (needNotifs) {
      console.log('[seed] inserting 50 notifications into MongoDB…');
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const notifDocs = NOTIF_SPECS.map((n) => {
        const createdAt = new Date(now - n.days * MS_PER_DAY);
        return {
          user_id:    studentIds[n.rec],
          type:       n.type,
          payload:    n.payload,
          read_at:    n.read ? new Date(createdAt.getTime() + MS_PER_DAY) : null,
          created_at: createdAt,
        };
      });

      await mongoDb.collection('notifications').insertMany(notifDocs);
    }

    const parts = [];
    if (needUsers)         parts.push('1 admin, 30 students, 9 categories');
    if (needListings)      parts.push('80 listings');
    if (needOffers)        parts.push('40 offers, 20 transactions, 25 reviews');
    if (needWishlist)      parts.push('30 wishlist items');
    if (needSavedSearches) parts.push('10 saved searches');
    if (needNotifs)        parts.push('50 notifications (MongoDB)');
    console.log(`[seed] done — ${parts.join(', ')}`);
    if (needUsers) {
      console.log('[seed] admin:   admin@nust.edu.pk  /  Admin@1234');
      console.log('[seed] student: ali.hassan@nust.edu.pk  /  Student@1234');
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed] FAILED:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    await mongoClient.close();
  }
};

seed();
