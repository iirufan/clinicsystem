import sql from '../lib/db.js';

const text = value =>
    String(value ?? '').trim();


/* =========================================================
   VERIFY USER
========================================================= */

async function verifyUser(userId) {

    const id = Number(userId);

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    const rows = await sql`
        SELECT
            id,
            username,
            full_name,
            role,
            COALESCE(approved, FALSE) AS approved,
            COALESCE(active, FALSE) AS active

        FROM users

        WHERE id = ${id}

        LIMIT 1
    `;

    const user =
        rows[0] || null;

    if (
        !user ||
        user.approved !== true ||
        user.active !== true
    ) {
        return null;
    }

    return user;
}


/* =========================================================
   GET COMPANY INFORMATION
========================================================= */

async function getCompany() {

    try {

        const rows = await sql`
            SELECT
                company_name,
                company_address,
                company_phone,
                company_email,
                company_registration_no

            FROM clinic_settings

            WHERE id = 1

            LIMIT 1
        `;

        return rows[0] || {};

    } catch (error) {

        console.error(
            'REPORT COMPANY ERROR:',
            error
        );

        return {};
    }
}


/* =========================================================
   MAIN API
========================================================= */

export default async function handler(
    req,
    res
) {

    try {


        /* =====================================================
           GET REQUESTS ONLY
        ===================================================== */

        if (
            req.method !== 'GET'
        ) {

            res.setHeader(
                'Allow',
                'GET'
            );

            return res
                .status(405)
                .json({

                    success: false,

                    message:
                        'Method not allowed.'

                });
        }


        /* =====================================================
           VERIFY USER
        ===================================================== */

        const user =
            await verifyUser(
                req.query.userId
            );

        if (!user) {

            return res
                .status(403)
                .json({

                    success: false,

                    message:
                        'Your login is not valid, approved, or active.'

                });
        }


        /* =====================================================
           PARAMETERS
        ===================================================== */

        const mode =
            text(
                req.query.mode
            );

        const reportDate =
            text(
                req.query.date
            );


        /* =====================================================
           VALIDATE DATE
        ===================================================== */

        if (
            !/^\d{4}-\d{2}-\d{2}$/
                .test(reportDate)
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        'A valid report date is required.'

                });
        }


        /* =====================================================
           DAILY DETAIL REPORT
        ===================================================== */

        if (
            mode ===
            'daily-sales'
        ) {

            const rows = await sql`

                SELECT

                    m.id,

                    m.memo_date,

                    m.receipt_no,

                    m.memo_no,


                    /* =========================================
                       PATIENT IDENTIFICATION
                    ========================================= */

                    COALESCE(

                        NULLIF(
                            p.patient_no,
                            ''
                        ),

                        NULLIF(
                            p.id_passport_no,
                            ''
                        ),

                        NULLIF(
                            p.passport_id,
                            ''
                        ),

                        NULLIF(
                            p.national_id,
                            ''
                        ),

                        CASE

                            WHEN
                                m.patient_id
                                IS NOT NULL

                            THEN
                                m.patient_id::text

                            ELSE
                                ''

                        END

                    )
                    AS patient_identifier,


                    /* =========================================
                       SERVICES GROSS
                    ========================================= */

                    COALESCE(
                        m.subtotal,
                        0
                    )
                    AS services_gross,


                    /* =========================================
                       TOTAL INSURANCE

                       Private Insurance + Aasandha
                    ========================================= */

                    (
                        COALESCE(
                            m.primary_insurance_cover,
                            0
                        )

                        +

                        COALESCE(
                            m.government_insurance_cover,
                            0
                        )
                    )
                    AS insurance_total,


                    /* =========================================
                       PATIENT PAYABLE
                    ========================================= */

                    COALESCE(
                        m.patient_payable,
                        m.patient_amount,
                        0
                    )
                    AS patient_payable,


                    /* =========================================
                       COLLECTED
                    ========================================= */

                    COALESCE(
                        m.paid_amount,
                        0
                    )
                    AS paid_amount,


                    /* =========================================
                       PAYMENT TYPE
                    ========================================= */

                    COALESCE(
                        pm.method_name,
                        ''
                    )
                    AS payment_method_name,


                    /* =========================================
                       DISCOUNT
                    ========================================= */

                    COALESCE(
                        m.discount_amount,
                        0
                    )
                    AS discount_amount


                FROM memos m


                /* =============================================
                   PATIENT
                ============================================= */

                LEFT JOIN patients p

                    ON p.id =
                        m.patient_id


                /* =============================================
                   PAYMENT METHOD
                ============================================= */

                LEFT JOIN payment_methods pm

                    ON pm.id =
                        m.payment_method_id


                /* =============================================
                   REPORT DATE
                ============================================= */

                WHERE

                    m.memo_date =
                        CAST(
                            ${reportDate}
                            AS date
                        )


                ORDER BY

                    m.id ASC
            `;


            return res
                .status(200)
                .json({

                    success: true,

                    date:
                        reportDate,

                    rows,

                    company:
                        await getCompany()

                });
        }


        /* =====================================================
           DAILY SUMMARY REPORT
        ===================================================== */

        if (
            mode ===
            'daily-summary'
        ) {


            /* =================================================
               MAIN SUMMARY
            ================================================= */

            const summaryRows = await sql`

                SELECT


                    /* =========================================
                       GROSS TOTAL
                    ========================================= */

                    COALESCE(
                        SUM(
                            COALESCE(
                                m.subtotal,
                                0
                            )
                        ),
                        0
                    )
                    AS gross_total,


                    /* =========================================
                       TOTAL DISCOUNT
                    ========================================= */

                    COALESCE(
                        SUM(
                            COALESCE(
                                m.discount_amount,
                                0
                            )
                        ),
                        0
                    )
                    AS total_discount,


                    /* =========================================
                       REVENUE

                       Gross Total - Discount
                    ========================================= */

                    (
                        COALESCE(
                            SUM(
                                COALESCE(
                                    m.subtotal,
                                    0
                                )
                            ),
                            0
                        )

                        -

                        COALESCE(
                            SUM(
                                COALESCE(
                                    m.discount_amount,
                                    0
                                )
                            ),
                            0
                        )
                    )
                    AS revenue,


                    /* =========================================
                       TOTAL INSURANCE

                       Private + Aasandha
                    ========================================= */

                    COALESCE(
                        SUM(

                            COALESCE(
                                m.primary_insurance_cover,
                                0
                            )

                            +

                            COALESCE(
                                m.government_insurance_cover,
                                0
                            )

                        ),
                        0
                    )
                    AS insurance_total,


                    /* =========================================
                       PATIENT PAYABLE
                    ========================================= */

                    COALESCE(
                        SUM(
                            COALESCE(
                                m.patient_payable,
                                m.patient_amount,
                                0
                            )
                        ),
                        0
                    )
                    AS patient_payable,


                    /* =========================================
                       PATIENT COUNT
                    ========================================= */

                    COUNT(

                        DISTINCT

                        CASE

                            WHEN
                                m.patient_id
                                IS NOT NULL

                            THEN

                                'P:' ||
                                m.patient_id::text


                            ELSE

                                'T:' ||
                                LOWER(
                                    COALESCE(
                                        m.patient_name,
                                        ''
                                    )
                                )

                        END

                    )::int
                    AS patient_count


                FROM memos m


                WHERE

                    m.memo_date =
                        CAST(
                            ${reportDate}
                            AS date
                        )
            `;


            /* =================================================
               PAYMENT METHODS

               Example:

               Bank Transfer
               MVR 1700.00 (6)

               Cash
               MVR 250.00 (4)
            ================================================= */

            const paymentMethods = await sql`

                SELECT

                    COALESCE(
                        pm.method_name,
                        'Unspecified'
                    )
                    AS method_name,


                    COUNT(*)::int
                    AS memo_count,


                    COALESCE(
                        SUM(
                            COALESCE(
                                m.paid_amount,
                                0
                            )
                        ),
                        0
                    )
                    AS collected


                FROM memos m


                LEFT JOIN payment_methods pm

                    ON pm.id =
                        m.payment_method_id


                WHERE

                    m.memo_date =
                        CAST(
                            ${reportDate}
                            AS date
                        )


                    AND


                    COALESCE(
                        m.paid_amount,
                        0
                    ) > 0


                GROUP BY

                    COALESCE(
                        pm.method_name,
                        'Unspecified'
                    )


                ORDER BY

                    collected DESC,

                    method_name ASC
            `;


            /* =================================================
               INSURANCE BY COMPANY

               Includes:

               Private insurance
               Aasandha
            ================================================= */

            const insurance = await sql`

                WITH insurance_rows AS (


                    /* =========================================
                       PRIVATE INSURANCE
                    ========================================= */

                    SELECT

                        COALESCE(
                            ic.company_name,
                            'Private Insurance'
                        )
                        AS insurance_name,


                        COUNT(*)::int
                        AS memo_count,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    m.primary_insurance_cover,
                                    0
                                )
                            ),
                            0
                        )
                        AS amount


                    FROM memos m


                    LEFT JOIN insurance_companies ic

                        ON ic.id =
                            m.primary_insurance_id


                    WHERE

                        m.memo_date =
                            CAST(
                                ${reportDate}
                                AS date
                            )


                        AND


                        COALESCE(
                            m.primary_insurance_cover,
                            0
                        ) > 0


                    GROUP BY

                        COALESCE(
                            ic.company_name,
                            'Private Insurance'
                        )



                    UNION ALL



                    /* =========================================
                       AASANDHA
                    ========================================= */

                    SELECT

                        'Aasandha'
                        AS insurance_name,


                        COUNT(*)::int
                        AS memo_count,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    m.government_insurance_cover,
                                    0
                                )
                            ),
                            0
                        )
                        AS amount


                    FROM memos m


                    WHERE

                        m.memo_date =
                            CAST(
                                ${reportDate}
                                AS date
                            )


                        AND


                        COALESCE(
                            m.government_insurance_cover,
                            0
                        ) > 0

                )


                /* =============================================
                   FINAL INSURANCE GROUPING
                ============================================= */

                SELECT

                    insurance_name,


                    SUM(
                        memo_count
                    )::int
                    AS memo_count,


                    SUM(
                        amount
                    )
                    AS amount


                FROM insurance_rows


                GROUP BY

                    insurance_name


                ORDER BY

                    amount DESC,

                    insurance_name ASC
            `;


            /* =================================================
               RETURN SUMMARY
            ================================================= */

            return res
                .status(200)
                .json({

                    success: true,

                    date:
                        reportDate,


                    summary:
                        summaryRows[0] ||
                        {},


                    insurance,


                    paymentMethods,


                    company:
                        await getCompany()

                });
        }


        /* =====================================================
           INVALID REPORT MODE
        ===================================================== */

        return res
            .status(400)
            .json({

                success: false,

                message:
                    'Invalid report mode.'

            });


    } catch (error) {


        /* =====================================================
           ERROR
        ===================================================== */

        console.error(
            'REPORT API ERROR:',
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    error?.message ||
                    'Unable to load report.'

            });
    }
}
