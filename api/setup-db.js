import sql from '../lib/db.js';

function send(res, status, data) {
    res.status(status).json(data);
}

export default async function handler(req, res) {

    // ---------------------------------------------------------
    // CHECK SETUP KEY
    // ---------------------------------------------------------

    const suppliedKey =
        req.headers['x-setup-key'] ||
        req.body?.setupKey;

    if (
        !process.env.SETUP_KEY ||
        suppliedKey !== process.env.SETUP_KEY
    ) {
        return send(res, 401, {
            success: false,
            message: 'Invalid setup key'
        });
    }

    // ---------------------------------------------------------
    // GET = CHECK DATABASE
    // ---------------------------------------------------------

    if (req.method === 'GET') {
        try {

            const tables = await sql`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `;

            return send(res, 200, {
                success: true,
                tables: tables.map(t => t.table_name)
            });

        } catch (error) {

            console.error(error);

            return send(res, 500, {
                success: false,
                message: error.message
            });
        }
    }

    // ---------------------------------------------------------
    // ONLY POST CAN CREATE
    // ---------------------------------------------------------

    if (req.method !== 'POST') {
        return send(res, 405, {
            success: false,
            message: 'Method not allowed'
        });
    }

    try {

        // =====================================================
        // INSURANCE COMPANIES
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS insurance_companies (
                id BIGSERIAL PRIMARY KEY,

                company_code VARCHAR(30) UNIQUE,
                company_name VARCHAR(150) NOT NULL,

                contact_person VARCHAR(150),

                phone VARCHAR(50),
                email VARCHAR(150),
                address TEXT,

                discount_percent NUMERIC(5,2) DEFAULT 0,

                active BOOLEAN DEFAULT TRUE,

                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // DOCTORS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS doctors (
                id BIGSERIAL PRIMARY KEY,

                doctor_code VARCHAR(30) UNIQUE,

                full_name VARCHAR(150) NOT NULL,

                speciality VARCHAR(150),

                registration_no VARCHAR(100),

                phone VARCHAR(50),
                email VARCHAR(150),

                active BOOLEAN DEFAULT TRUE,

                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // USERS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,

                username VARCHAR(100)
                    UNIQUE
                    NOT NULL,

                password_hash TEXT
                    NOT NULL,

                full_name VARCHAR(150)
                    NOT NULL,

                role VARCHAR(30)
                    NOT NULL,

                doctor_id BIGINT
                    REFERENCES doctors(id)
                    ON DELETE SET NULL,

                active BOOLEAN DEFAULT TRUE,

                last_login_at TIMESTAMPTZ,

                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),

                CONSTRAINT valid_user_role
                CHECK (
                    role IN (
                        'admin',
                        'doctor',
                        'reception',
                        'accounts'
                    )
                )
            )
        `;


        // =====================================================
        // PATIENTS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS patients (
                id BIGSERIAL PRIMARY KEY,

                patient_no VARCHAR(30)
                    UNIQUE
                    NOT NULL,

                full_name VARCHAR(150)
                    NOT NULL,

                passport_id VARCHAR(100),

                national_id VARCHAR(100),

                date_of_birth DATE,

                gender VARCHAR(20),

                nationality VARCHAR(100),

                phone VARCHAR(50),

                email VARCHAR(150),

                address TEXT,

                insurance_company_id BIGINT
                    REFERENCES insurance_companies(id)
                    ON DELETE SET NULL,

                insurance_member_no VARCHAR(100),

                emergency_contact_name VARCHAR(150),

                emergency_contact_phone VARCHAR(50),

                active BOOLEAN DEFAULT TRUE,

                created_at TIMESTAMPTZ DEFAULT NOW(),

                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // APPOINTMENTS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS appointments (
                id BIGSERIAL PRIMARY KEY,

                patient_id BIGINT
                    NOT NULL
                    REFERENCES patients(id)
                    ON DELETE CASCADE,

                doctor_id BIGINT
                    REFERENCES doctors(id)
                    ON DELETE SET NULL,

                appointment_date DATE
                    NOT NULL,

                appointment_time TIME,

                reason TEXT,

                status VARCHAR(30)
                    DEFAULT 'BOOKED',

                notes TEXT,

                created_by BIGINT
                    REFERENCES users(id)
                    ON DELETE SET NULL,

                created_at TIMESTAMPTZ DEFAULT NOW(),

                updated_at TIMESTAMPTZ DEFAULT NOW(),

                CONSTRAINT valid_appointment_status
                CHECK (
                    status IN (
                        'BOOKED',
                        'ARRIVED',
                        'COMPLETED',
                        'CANCELLED',
                        'NO_SHOW'
                    )
                )
            )
        `;


        // =====================================================
        // MEDICAL HISTORY / VISITS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS medical_history (
                id BIGSERIAL PRIMARY KEY,

                patient_id BIGINT
                    NOT NULL
                    REFERENCES patients(id)
                    ON DELETE CASCADE,

                doctor_id BIGINT
                    REFERENCES doctors(id)
                    ON DELETE SET NULL,

                visit_date DATE
                    NOT NULL
                    DEFAULT CURRENT_DATE,

                visit_time TIME,

                complaint TEXT,

                symptoms TEXT,

                examination TEXT,

                diagnosis TEXT,

                treatment TEXT,

                advice TEXT,

                notes TEXT,

                blood_pressure VARCHAR(30),

                temperature NUMERIC(5,2),

                weight NUMERIC(7,2),

                height NUMERIC(7,2),

                pulse INTEGER,

                follow_up_date DATE,

                created_by BIGINT
                    REFERENCES users(id)
                    ON DELETE SET NULL,

                created_at TIMESTAMPTZ DEFAULT NOW(),

                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // PRESCRIPTIONS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS prescriptions (
                id BIGSERIAL PRIMARY KEY,

                medical_history_id BIGINT
                    NOT NULL
                    REFERENCES medical_history(id)
                    ON DELETE CASCADE,

                medicine_name VARCHAR(200)
                    NOT NULL,

                dosage VARCHAR(100),

                frequency VARCHAR(100),

                duration VARCHAR(100),

                instructions TEXT,

                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // MEMOS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS memos (
                id BIGSERIAL PRIMARY KEY,

                memo_no VARCHAR(50)
                    UNIQUE
                    NOT NULL,

                patient_id BIGINT
                    NOT NULL
                    REFERENCES patients(id)
                    ON DELETE CASCADE,

                doctor_id BIGINT
                    REFERENCES doctors(id)
                    ON DELETE SET NULL,

                medical_history_id BIGINT
                    REFERENCES medical_history(id)
                    ON DELETE SET NULL,

                insurance_company_id BIGINT
                    REFERENCES insurance_companies(id)
                    ON DELETE SET NULL,

                memo_date DATE
                    NOT NULL
                    DEFAULT CURRENT_DATE,

                subtotal NUMERIC(12,2)
                    DEFAULT 0,

                discount_percent NUMERIC(5,2)
                    DEFAULT 0,

                discount_amount NUMERIC(12,2)
                    DEFAULT 0,

                insurance_amount NUMERIC(12,2)
                    DEFAULT 0,

                patient_amount NUMERIC(12,2)
                    DEFAULT 0,

                total_amount NUMERIC(12,2)
                    DEFAULT 0,

                status VARCHAR(30)
                    DEFAULT 'OPEN',

                remarks TEXT,

                created_by BIGINT
                    REFERENCES users(id)
                    ON DELETE SET NULL,

                created_at TIMESTAMPTZ DEFAULT NOW(),

                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // MEMO ITEMS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS memo_items (
                id BIGSERIAL PRIMARY KEY,

                memo_id BIGINT
                    NOT NULL
                    REFERENCES memos(id)
                    ON DELETE CASCADE,

                item_code VARCHAR(50),

                description VARCHAR(250)
                    NOT NULL,

                quantity NUMERIC(10,2)
                    DEFAULT 1,

                unit_price NUMERIC(12,2)
                    DEFAULT 0,

                discount_percent NUMERIC(5,2)
                    DEFAULT 0,

                amount NUMERIC(12,2)
                    DEFAULT 0,

                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // PAYMENTS
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS payments (
                id BIGSERIAL PRIMARY KEY,

                memo_id BIGINT
                    REFERENCES memos(id)
                    ON DELETE CASCADE,

                patient_id BIGINT
                    REFERENCES patients(id)
                    ON DELETE CASCADE,

                payment_date TIMESTAMPTZ
                    DEFAULT NOW(),

                amount NUMERIC(12,2)
                    NOT NULL,

                payment_method VARCHAR(50),

                reference_no VARCHAR(100),

                remarks TEXT,

                received_by BIGINT
                    REFERENCES users(id)
                    ON DELETE SET NULL,

                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;


        // =====================================================
        // AUDIT LOG
        // =====================================================

        await sql`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGSERIAL PRIMARY KEY,

                user_id BIGINT
                    REFERENCES users(id)
                    ON DELETE SET NULL,

                action VARCHAR(100)
                    NOT NULL,

                table_name VARCHAR(100),

                record_id BIGINT,

                description TEXT,

                ip_address VARCHAR(100),

                created_at TIMESTAMPTZ
                    DEFAULT NOW()
            )
        `;


        // =====================================================
        // INDEXES
        // =====================================================

        await sql`
            CREATE INDEX IF NOT EXISTS idx_patient_name
            ON patients(full_name)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_patient_passport
            ON patients(passport_id)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_patient_phone
            ON patients(phone)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_appointment_date
            ON appointments(appointment_date)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_appointment_patient
            ON appointments(patient_id)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_medical_patient
            ON medical_history(patient_id)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_medical_visit_date
            ON medical_history(visit_date)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_memo_patient
            ON memos(patient_id)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_memo_date
            ON memos(memo_date)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_payment_date
            ON payments(payment_date)
        `;


        // =====================================================
        // RETURN TABLE LIST
        // =====================================================

        const tables = await sql`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `;

        return send(res, 200, {

            success: true,

            message:
                'Clinic database created successfully',

            tables:
                tables.map(t => t.table_name)
        });

    } catch (error) {

        console.error(
            'DATABASE SETUP ERROR:',
            error
        );

        return send(res, 500, {

            success: false,

            message:
                error.message || 'Database setup failed'
        });
    }
}
