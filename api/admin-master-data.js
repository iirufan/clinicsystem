import sql from '../lib/db.js';


/* =========================================================
   VERIFY USER
========================================================= */

async function verifyUser(
    userId
) {

    if (!userId) {
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

            WHERE id =
                ${Number(userId)}

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


    if (
        user.role !== 'admin' &&
        user.role !== 'supervisor'
    ) {
        return null;
    }


    return user;
}


/* =========================================================
   HANDLER
========================================================= */

export default async function handler(
    req,
    res
) {

    try {


        /* =====================================================
           GET
        ===================================================== */

        if (
            req.method === 'GET'
        ) {

            const user =
                await verifyUser(
                    req.query.userId
                );


            if (!user) {

                return res
                    .status(403)
                    .json({

                        success:false,

                        message:
                            'Admin or Supervisor access required.'
                    });
            }


            /* SERVICES */

            const services =
                await sql`
                    SELECT
                        id,
                        service_name,
                        price,
                        aasandha_price,
                        active,
                        created_at,
                        updated_at

                    FROM services

                    ORDER BY
                        service_name
                `;


            /* INSURANCE */

            const insurance =
                await sql`
                    SELECT
                        id,
                        company_code,
                        company_name,
                        short_name,

                        contact_person,
                        phone,
                        email,
                        address,

                        discount_percent,

                        COALESCE(
                            is_government,
                            FALSE
                        )
                        AS is_government,

                        COALESCE(
                            charge_method,
                            'percent'
                        )
                        AS charge_method,

                        COALESCE(
                            charge_value,
                            0
                        )
                        AS charge_value,

                        notes,

                        active,

                        created_at,
                        updated_at

                    FROM insurance_companies

                    ORDER BY
                        company_name
                `;


            /* PAYMENT METHODS */

            const paymentMethods =
                await sql`
                    SELECT
                        id,
                        method_name,
                        active,
                        created_at,
                        updated_at

                    FROM payment_methods

                    ORDER BY
                        method_name
                `;


            /* CURRENCIES */

            const currencies =
                await sql`
                    SELECT
                        id,
                        currency_code,
                        currency_name,
                        symbol,
                        exchange_rate,
                        is_default,
                        active,
                        created_at,
                        updated_at

                    FROM currencies

                    ORDER BY
                        is_default DESC,
                        currency_code
                `;


            /* COMPANY SETTINGS */

            const companyRows =
                await sql`
                    SELECT
                        id,
                        company_name,
                        company_address,
                        company_phone,
                        company_email,
                        company_registration_no,
                        receipt_prefix,
                        receipt_next_number,
                        receipt_digits,
                        updated_at,
                        updated_by

                    FROM clinic_settings

                    WHERE id = 1

                    LIMIT 1
                `;


            return res
                .status(200)
                .json({

                    success:true,

                    services,

                    insurance,

                    paymentMethods,

                    currencies,

                    company:
                        companyRows[0] ||
                        null
                });
        }


        /* =====================================================
           ONLY POST / PUT BELOW
        ===================================================== */

        if (
            req.method !== 'POST' &&
            req.method !== 'PUT'
        ) {

            return res
                .status(405)
                .json({

                    success:false,

                    message:
                        'Method not allowed.'
                });
        }


        const body =
            req.body ||
            {};


        const user =
            await verifyUser(
                body.userId
            );


        if (!user) {

            return res
                .status(403)
                .json({

                    success:false,

                    message:
                        'Admin or Supervisor access required.'
                });
        }


        const type =
            String(
                body.type ||
                ''
            )
            .trim()
            .toLowerCase();


        /* =====================================================
           SERVICE
        ===================================================== */

        if (
            type === 'service'
        ) {

            const serviceName =
                String(
                    body.serviceName ||
                    ''
                ).trim();


            if (!serviceName) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Service name is required.'
                    });
            }


            const price =
                Math.max(
                    0,
                    Number(
                        body.price ||
                        0
                    )
                );


            const aasandhaPrice =
                Math.max(
                    0,
                    Number(
                        body.aasandhaPrice ||
                        0
                    )
                );


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO services (

                        service_name,
                        price,
                        aasandha_price,
                        active,
                        created_by,
                        created_at,
                        updated_at

                    )

                    VALUES (

                        ${serviceName},
                        ${price},
                        ${aasandhaPrice},
                        TRUE,
                        ${user.id},
                        NOW(),
                        NOW()
                    )
                `;

            } else {

                if (!body.id) {

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Service ID required.'
                        });
                }


                await sql`
                    UPDATE services

                    SET
                        service_name =
                            ${serviceName},

                        price =
                            ${price},

                        aasandha_price =
                            ${aasandhaPrice},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(body.id)}
                `;
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        /* =====================================================
           INSURANCE
        ===================================================== */

        if (
            type === 'insurance'
        ) {

            const companyName =
                String(
                    body.companyName ||
                    ''
                ).trim();


            if (!companyName) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Insurance company name is required.'
                    });
            }


            const companyCode =
                String(
                    body.companyCode ||
                    ''
                )
                .trim()
                .toUpperCase();


            const shortName =
                String(
                    body.shortName ||
                    ''
                ).trim();


            const method =
                body.chargeMethod ===
                'fixed'
                ?
                'fixed'
                :
                'percent';


            const value =
                Math.max(
                    0,
                    Number(
                        body.chargeValue ||
                        0
                    )
                );


            const isGovernment =
                Boolean(
                    body.isGovernment
                );


            /*
             Only one active government insurance
             should normally exist.
            */

            if (isGovernment) {

                await sql`
                    UPDATE insurance_companies

                    SET
                        is_government =
                            FALSE,

                        updated_at =
                            NOW()

                    WHERE
                        is_government =
                            TRUE

                        AND (
                            ${body.id || null}::bigint
                            IS NULL

                            OR id !=
                            ${body.id || null}
                        )
                `;
            }


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO insurance_companies (

                        company_code,
                        company_name,
                        short_name,

                        phone,
                        email,

                        charge_method,
                        charge_value,

                        is_government,

                        notes,

                        active,

                        created_at,
                        updated_at

                    )

                    VALUES (

                        ${
                            companyCode ||
                            null
                        },

                        ${companyName},

                        ${
                            shortName ||
                            null
                        },

                        ${
                            String(
                                body.phone ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${
                            String(
                                body.email ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${method},

                        ${value},

                        ${isGovernment},

                        ${
                            String(
                                body.notes ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        TRUE,

                        NOW(),
                        NOW()
                    )
                `;

            } else {

                if (!body.id) {

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Insurance ID required.'
                        });
                }


                await sql`
                    UPDATE insurance_companies

                    SET
                        company_code =
                            ${
                                companyCode ||
                                null
                            },

                        company_name =
                            ${companyName},

                        short_name =
                            ${
                                shortName ||
                                null
                            },

                        phone =
                            ${
                                String(
                                    body.phone ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        email =
                            ${
                                String(
                                    body.email ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        charge_method =
                            ${method},

                        charge_value =
                            ${value},

                        is_government =
                            ${isGovernment},

                        notes =
                            ${
                                String(
                                    body.notes ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(body.id)}
                `;
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        /* =====================================================
           PAYMENT METHOD
        ===================================================== */

        if (
            type === 'payment'
        ) {

            const methodName =
                String(
                    body.methodName ||
                    ''
                ).trim();


            if (!methodName) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Payment method name required.'
                    });
            }


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO payment_methods (

                        method_name,
                        active,
                        created_by,
                        created_at,
                        updated_at

                    )

                    VALUES (

                        ${methodName},
                        TRUE,
                        ${user.id},
                        NOW(),
                        NOW()
                    )
                `;

            } else {

                if (!body.id) {

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Payment method ID required.'
                        });
                }


                await sql`
                    UPDATE payment_methods

                    SET
                        method_name =
                            ${methodName},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(body.id)}
                `;
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        /* =====================================================
           CURRENCY
        ===================================================== */

        if (
            type === 'currency'
        ) {

            const currencyCode =
                String(
                    body.currencyCode ||
                    ''
                )
                .trim()
                .toUpperCase();


            const currencyName =
                String(
                    body.currencyName ||
                    ''
                ).trim();


            if (
                !currencyCode ||
                !currencyName
            ) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Currency code and name are required.'
                    });
            }


            const isDefault =
                Boolean(
                    body.isDefault
                );


            if (isDefault) {

                await sql`
                    UPDATE currencies

                    SET
                        is_default =
                            FALSE,

                        updated_at =
                            NOW()
                `;
            }


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO currencies (

                        currency_code,
                        currency_name,
                        symbol,
                        exchange_rate,
                        is_default,
                        active,
                        created_by,
                        created_at,
                        updated_at

                    )

                    VALUES (

                        ${currencyCode},

                        ${currencyName},

                        ${
                            String(
                                body.symbol ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${
                            Math.max(
                                0,
                                Number(
                                    body.exchangeRate ||
                                    1
                                )
                            )
                        },

                        ${isDefault},

                        TRUE,

                        ${user.id},

                        NOW(),
                        NOW()
                    )
                `;

            } else {

                if (!body.id) {

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Currency ID required.'
                        });
                }


                await sql`
                    UPDATE currencies

                    SET
                        currency_code =
                            ${currencyCode},

                        currency_name =
                            ${currencyName},

                        symbol =
                            ${
                                String(
                                    body.symbol ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        exchange_rate =
                            ${
                                Math.max(
                                    0,
                                    Number(
                                        body.exchangeRate ||
                                        1
                                    )
                                )
                            },

                        is_default =
                            ${isDefault},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(body.id)}
                `;
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        /* =====================================================
           COMPANY SETTINGS
        ===================================================== */

        if (
            type === 'company'
        ) {

            const companyName =
                String(
                    body.companyName ||
                    ''
                ).trim();


            if (!companyName) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Company / Clinic name required.'
                    });
            }


            /*
             Admin may change receipt numbering.
             Supervisor may change company information only.
            */

            if (
                user.role === 'admin'
            ) {

                const receiptPrefix =
                    String(
                        body.receiptPrefix ||
                        ''
                    ).trim();


                const nextNumber =
                    Math.max(
                        1,
                        Math.floor(
                            Number(
                                body.receiptNextNumber ||
                                1
                            )
                        )
                    );


                const digits =
                    Math.min(
                        12,
                        Math.max(
                            1,
                            Math.floor(
                                Number(
                                    body.receiptDigits ||
                                    6
                                )
                            )
                        )
                    );


                await sql`
                    INSERT INTO clinic_settings (

                        id,

                        company_name,
                        company_address,
                        company_phone,
                        company_email,
                        company_registration_no,

                        receipt_prefix,
                        receipt_next_number,
                        receipt_digits,

                        updated_by,
                        updated_at

                    )

                    VALUES (

                        1,

                        ${companyName},

                        ${
                            String(
                                body.companyAddress ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${
                            String(
                                body.companyPhone ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${
                            String(
                                body.companyEmail ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${
                            String(
                                body.companyRegistrationNo ||
                                ''
                            ).trim()
                            ||
                            null
                        },

                        ${receiptPrefix},

                        ${nextNumber},

                        ${digits},

                        ${user.id},

                        NOW()
                    )

                    ON CONFLICT (id)

                    DO UPDATE SET

                        company_name =
                            EXCLUDED.company_name,

                        company_address =
                            EXCLUDED.company_address,

                        company_phone =
                            EXCLUDED.company_phone,

                        company_email =
                            EXCLUDED.company_email,

                        company_registration_no =
                            EXCLUDED.company_registration_no,

                        receipt_prefix =
                            EXCLUDED.receipt_prefix,

                        receipt_next_number =
                            EXCLUDED.receipt_next_number,

                        receipt_digits =
                            EXCLUDED.receipt_digits,

                        updated_by =
                            EXCLUDED.updated_by,

                        updated_at =
                            NOW()
                `;

            } else {

                await sql`
                    UPDATE clinic_settings

                    SET
                        company_name =
                            ${companyName},

                        company_address =
                            ${
                                String(
                                    body.companyAddress ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        company_phone =
                            ${
                                String(
                                    body.companyPhone ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        company_email =
                            ${
                                String(
                                    body.companyEmail ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        company_registration_no =
                            ${
                                String(
                                    body.companyRegistrationNo ||
                                    ''
                                ).trim()
                                ||
                                null
                            },

                        updated_by =
                            ${user.id},

                        updated_at =
                            NOW()

                    WHERE id = 1
                `;
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        /* =====================================================
           TOGGLE ACTIVE STATUS
        ===================================================== */

        if (
            type === 'toggle'
        ) {

            const id =
                Number(
                    body.id
                );


            const active =
                Boolean(
                    body.active
                );


            const entity =
                String(
                    body.entity ||
                    ''
                );


            if (!id) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Record ID required.'
                    });
            }


            if (
                entity === 'service'
            ) {

                await sql`
                    UPDATE services

                    SET
                        active =
                            ${active},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${id}
                `;

            } else if (
                entity === 'insurance'
            ) {

                await sql`
                    UPDATE insurance_companies

                    SET
                        active =
                            ${active},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${id}
                `;

            } else if (
                entity === 'payment'
            ) {

                await sql`
                    UPDATE payment_methods

                    SET
                        active =
                            ${active},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${id}
                `;

            } else if (
                entity === 'currency'
            ) {

                await sql`
                    UPDATE currencies

                    SET
                        active =
                            ${active},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${id}
                `;

            } else {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Invalid entity.'
                    });
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        return res
            .status(400)
            .json({

                success:false,

                message:
                    'Invalid Master Data request.'
            });


    } catch(error) {

        console.error(
            'ADMIN MASTER DATA ERROR:',
            error
        );


        /*
         PostgreSQL duplicate value
        */

        if (
            error.code ===
            '23505'
        ) {

            return res
                .status(409)
                .json({

                    success:false,

                    message:
                        'A record with this name or code already exists.'
                });
        }


        return res
            .status(500)
            .json({

                success:false,

                message:
                    error.message ||
                    'Unable to process Master Data.'
            });
    }
}
