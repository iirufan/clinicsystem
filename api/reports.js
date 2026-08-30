import sql from '../lib/db.js';


/* =========================================================
   HELPERS
========================================================= */

const txt = value =>
    String(value ?? '').trim();


/* =========================================================
   VERIFY USER
========================================================= */

async function verifyUser(userId) {

    const id =
        Number(userId);


    if (!id) {
        return null;
    }


    const rows =
        await sql`
            SELECT
                id,
                username,
                full_name,
                role,
                approved,
                active

            FROM users

            WHERE id = ${id}

            LIMIT 1
        `;


    const user =
        rows[0];


    if (
        !user ||
        !user.approved ||
        !user.active
    ) {
        return null;
    }


    return user;
}


/* =========================================================
   COMPANY INFORMATION
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
            'COMPANY SETTINGS ERROR:',
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
           ONLY GET REQUESTS
        ===================================================== */

        if (
            req.method !== 'GET'
        ) {

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
                        'User access denied.'
                });
        }


        /* =====================================================
           PARAMETERS
        ===================================================== */

        const mode =
            txt(
                req.query.mode
            );


        const reportDate =
            txt(
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
                        'Valid report date is required.'
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
                            m.patient_name
                        )
                        AS patient_name,


                        COALESCE(
                            du.full_name,
                            d.full_name
                        )
                        AS doctor_name,


                        ic.company_name
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


                        pm.method_name
                        AS payment_method_name,


                        m.status


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
                            ${reportDate}::date


                    ORDER BY
                        m.id
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
               MAIN DAILY TOTALS
            ================================================= */

            const summary =
                await sql`
                    SELECT

                        COUNT(*)::int
                        AS memo_count,


                        COALESCE(
                            SUM(subtotal),
                            0
                        )
                        AS gross_charges,


                        COALESCE(
                            SUM(discount_amount),
                            0
                        )
                        AS total_discount,


                        COALESCE(
                            SUM(
                                primary_insurance_cover
                            ),
                            0
                        )
                        AS private_insurance,


                        COALESCE(
                            SUM(
                                government_insurance_cover
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
                                paid_amount
                            ),
                            0
                        )
                        AS collected,


                        COALESCE(
                            SUM(
                                balance_amount
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
                            ${reportDate}::date
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
                                m.paid_amount
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
                            ${reportDate}::date


                    GROUP BY

                        COALESCE(
                            pm.method_name,
                            'Unspecified'
                        )


                    ORDER BY
                        collected DESC
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
                                m.primary_insurance_cover
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
                            ${reportDate}::date


                    GROUP BY

                        COALESCE(
                            ic.company_name,
                            'No Private Insurance'
                        )


                    ORDER BY
                        cover_amount DESC
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
                                m.total_amount
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
                            ${reportDate}::date


                    GROUP BY

                        COALESCE(
                            du.full_name,
                            d.full_name,
                            'Unassigned'
                        )


                    ORDER BY
                        net_charges DESC
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
                                mi.quantity
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
                            ${reportDate}::date


                    GROUP BY

                        COALESCE(
                            mi.service_name,
                            mi.description,
                            'Service'
                        )


                    ORDER BY
                        amount DESC
                `;


            /* =================================================
               RETURN DAILY SUMMARY
            ================================================= */

            return res
                .status(200)
                .json({

                    success:
                        true,

                    date:
                        reportDate,

                    summary:
                        summary[0] || {},

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
           ERROR
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
                    error.message ||
                    'Unable to load report.'
            });
    }
}
