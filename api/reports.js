import sql from '../lib/db.js';


/* =========================================================
   HELPERS
========================================================= */

const text = value =>
    String(value ?? '').trim();


/* =========================================================
   VERIFY USER
========================================================= */

async function verifyUser(userId) {

    const id =
        Number(userId);


    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {
        return null;
    }


    const rows =
        await sql`
            SELECT
                id,
                username,
                full_name,
                role,
                COALESCE(
                    approved,
                    FALSE
                ) AS approved,
                COALESCE(
                    active,
                    FALSE
                ) AS active

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

        const rows =
            await sql`
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
           ONLY ALLOW GET
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

                    success:
                        false,

                    message:
                        'Method not allowed.'

                });
        }


        /* =====================================================
           VERIFY LOGGED-IN USER
        ===================================================== */

        const user =
            await verifyUser(
                req.query.userId
            );


        if (!user) {

            return res
                .status(403)
                .json({

                    success:
                        false,

                    message:
                        'Your login is not valid, approved, or active.'

                });
        }


        /* =====================================================
           REQUEST PARAMETERS
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

                    success:
                        false,

                    message:
                        'A valid report date is required.'

                });
        }


        /* =====================================================
           DAILY SALES REPORT
        ===================================================== */

        if (
            mode ===
            'daily-sales'
        ) {

            const rows =
                await sql`
                    SELECT

                        m.id,

                        m.memo_date,

                        m.receipt_no,

                        m.memo_no,


                        COALESCE(
                            p.full_name,
                            m.patient_name,
                            'Unknown Patient'
                        )
                        AS patient_name,


                        COALESCE(
                            du.full_name,
                            d.full_name,
                            'Unassigned'
                        )
                        AS doctor_name,


                        COALESCE(
                            ic.company_name,
                            ''
                        )
                        AS insurance_name,


                        COALESCE(
                            m.subtotal,
                            0
                        )
                        AS subtotal,


                        COALESCE(
                            m.discount_amount,
                            0
                        )
                        AS discount_amount,


                        COALESCE(
                            m.primary_insurance_cover,
                            0
                        )
                        AS primary_insurance_cover,


                        COALESCE(
                            m.government_insurance_cover,
                            0
                        )
                        AS government_insurance_cover,


                        COALESCE(
                            m.patient_payable,
                            m.patient_amount,
                            0
                        )
                        AS patient_payable,


                        COALESCE(
                            m.paid_amount,
                            0
                        )
                        AS paid_amount,


                        COALESCE(
                            m.balance_amount,
                            0
                        )
                        AS balance_amount,


                        COALESCE(
                            pm.method_name,
                            ''
                        )
                        AS payment_method_name,


                        COALESCE(
                            m.status,
                            ''
                        )
                        AS status


                    FROM memos m


                    LEFT JOIN patients p

                        ON p.id =
                            m.patient_id


                    LEFT JOIN users du

                        ON du.id =
                            m.doctor_user_id


                    LEFT JOIN doctors d

                        ON d.id =
                            m.doctor_id


                    LEFT JOIN insurance_companies ic

                        ON ic.id =
                            m.primary_insurance_id


                    LEFT JOIN payment_methods pm

                        ON pm.id =
                            m.payment_method_id


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

                    success:
                        true,

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

            const summaryRows =
                await sql`
                    SELECT

                        COUNT(*)::int
                        AS memo_count,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    subtotal,
                                    0
                                )
                            ),
                            0
                        )
                        AS gross_charges,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    discount_amount,
                                    0
                                )
                            ),
                            0
                        )
                        AS total_discount,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    primary_insurance_cover,
                                    0
                                )
                            ),
                            0
                        )
                        AS private_insurance,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    government_insurance_cover,
                                    0
                                )
                            ),
                            0
                        )
                        AS aasandha,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    patient_payable,
                                    patient_amount,
                                    0
                                )
                            ),
                            0
                        )
                        AS patient_payable,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    paid_amount,
                                    0
                                )
                            ),
                            0
                        )
                        AS collected,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    balance_amount,
                                    0
                                )
                            ),
                            0
                        )
                        AS outstanding,


                        COUNT(*)
                        FILTER (

                            WHERE

                                UPPER(
                                    COALESCE(
                                        status,
                                        ''
                                    )
                                )
                                =
                                'PAID'

                        )::int
                        AS paid_count,


                        COUNT(*)
                        FILTER (

                            WHERE

                                UPPER(
                                    COALESCE(
                                        status,
                                        ''
                                    )
                                )
                                =
                                'PARTIAL'

                        )::int
                        AS partial_count


                    FROM memos


                    WHERE

                        memo_date =
                            CAST(
                                ${reportDate}
                                AS date
                            )
                `;


            /* =================================================
               PAYMENT METHOD SUMMARY
            ================================================= */

            const paymentMethods =
                await sql`
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
               INSURANCE SUMMARY
            ================================================= */

            const insurance =
                await sql`
                    SELECT

                        COALESCE(
                            ic.company_name,
                            'No Private Insurance'
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
                        AS cover_amount


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


                    GROUP BY

                        COALESCE(
                            ic.company_name,
                            'No Private Insurance'
                        )


                    ORDER BY

                        cover_amount DESC,

                        insurance_name ASC
                `;


            /* =================================================
               DOCTOR SUMMARY
            ================================================= */

            const doctors =
                await sql`
                    SELECT

                        COALESCE(
                            du.full_name,
                            d.full_name,
                            'Unassigned'
                        )
                        AS doctor_name,


                        COUNT(*)::int
                        AS memo_count,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    m.total_amount,

                                    m.subtotal -
                                    m.discount_amount,

                                    0
                                )
                            ),
                            0
                        )
                        AS net_charges


                    FROM memos m


                    LEFT JOIN users du

                        ON du.id =
                            m.doctor_user_id


                    LEFT JOIN doctors d

                        ON d.id =
                            m.doctor_id


                    WHERE

                        m.memo_date =
                            CAST(
                                ${reportDate}
                                AS date
                            )


                    GROUP BY

                        COALESCE(
                            du.full_name,
                            d.full_name,
                            'Unassigned'
                        )


                    ORDER BY

                        net_charges DESC,

                        doctor_name ASC
                `;


            /* =================================================
               SERVICE SUMMARY
            ================================================= */

            const services =
                await sql`
                    SELECT

                        COALESCE(
                            mi.service_name,
                            mi.description,
                            'Service'
                        )
                        AS service_name,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    mi.quantity,
                                    0
                                )
                            ),
                            0
                        )
                        AS quantity,


                        COALESCE(
                            SUM(
                                COALESCE(
                                    mi.line_total,
                                    mi.amount,
                                    0
                                )
                            ),
                            0
                        )
                        AS amount


                    FROM memo_items mi


                    INNER JOIN memos m

                        ON m.id =
                            mi.memo_id


                    WHERE

                        m.memo_date =
                            CAST(
                                ${reportDate}
                                AS date
                            )


                    GROUP BY

                        COALESCE(
                            mi.service_name,
                            mi.description,
                            'Service'
                        )


                    ORDER BY

                        amount DESC,

                        service_name ASC
                `;


            /* =================================================
               RETURN SUMMARY
            ================================================= */

            return res
                .status(200)
                .json({

                    success:
                        true,

                    date:
                        reportDate,


                    summary:
                        summaryRows[0] ||
                        {},


                    paymentMethods,


                    insurance,


                    doctors,


                    services,


                    company:
                        await getCompany()

                });
        }


        /* =====================================================
           INVALID MODE
        ===================================================== */

        return res
            .status(400)
            .json({

                success:
                    false,

                message:
                    'Invalid report mode.'

            });


    } catch (error) {


        /* =====================================================
           API ERROR
        ===================================================== */

        console.error(
            'REPORT API ERROR:',
            error
        );


        return res
            .status(500)
            .json({

                success:
                    false,

                message:
                    error?.message ||
                    'Unable to load report.'

            });
    }
}
