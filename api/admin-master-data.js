import sql from '../lib/db.js';


const ALLOWED_ROLES = [
    'admin',
    'supervisor'
];


async function checkAccess(userId) {

    if (!userId) {
        return null;
    }


    const rows =
        await sql`
            SELECT
                id,
                username,
                role,
                approved,
                active
            FROM users
            WHERE id = ${userId}
            LIMIT 1
        `;


    if (!rows.length) {
        return null;
    }


    const user =
        rows[0];


    if (
        !user.approved ||
        !user.active ||
        !ALLOWED_ROLES.includes(
            user.role
        )
    ) {
        return null;
    }


    return user;
}


export default async function handler(
    req,
    res
) {

    try {

        /* =================================================
           READ DATA
        ================================================= */

        if (
            req.method === 'GET'
        ) {

            const services =
                await sql`
                    SELECT
                        id,
                        service_name,
                        price,
                        aasandha_price,
                        active,
                        created_at
                    FROM services
                    ORDER BY
                        active DESC,
                        service_name
                `;


            const insurance =
                await sql`
                    SELECT
                        id,
                        company_name,
                        short_name,
                        phone,
                        email,
                        notes,
                        active,
                        created_at
                    FROM insurance_companies
                    ORDER BY
                        active DESC,
                        company_name
                `;


            const paymentMethods =
                await sql`
                    SELECT
                        id,
                        method_name,
                        active,
                        created_at
                    FROM payment_methods
                    ORDER BY
                        active DESC,
                        method_name
                `;


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
                        created_at
                    FROM currencies
                    ORDER BY
                        is_default DESC,
                        active DESC,
                        currency_code
                `;


            return res
                .status(200)
                .json({
                    success:true,
                    services,
                    insurance,
                    paymentMethods,
                    currencies
                });
        }


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
            req.body || {};


        const user =
            await checkAccess(
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


        /* =================================================
           TOGGLE
        ================================================= */

        if (
            req.method === 'PUT' &&
            body.type === 'toggle'
        ) {

            const id =
                Number(body.id);


            const active =
                Boolean(
                    body.active
                );


            if (!id) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Invalid item.'
                    });
            }


            switch(
                body.entity
            ) {

                case 'service':

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

                    break;


                case 'insurance':

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

                    break;


                case 'payment':

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

                    break;


                case 'currency':

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

                    break;


                default:

                    return res
                        .status(400)
                        .json({
                            success:false,
                            message:
                                'Invalid type.'
                        });
            }


            return res
                .status(200)
                .json({
                    success:true
                });
        }


        /* =================================================
           SERVICE
        ================================================= */

        if (
            body.type === 'service'
        ) {

            const serviceName =
                String(
                    body.service_name ||
                    ''
                ).trim();


            const price =
                Number(
                    body.price
                );


            const aasandhaPrice =
                Number(
                    body.aasandha_price
                );


            if (!serviceName) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Service name required.'
                    });
            }


            if (
                !Number.isFinite(price) ||
                !Number.isFinite(
                    aasandhaPrice
                ) ||
                price < 0 ||
                aasandhaPrice < 0
            ) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Invalid service price.'
                    });
            }


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO services (
                        service_name,
                        price,
                        aasandha_price,
                        active,
                        created_by
                    )

                    VALUES (
                        ${serviceName},
                        ${price},
                        ${aasandhaPrice},
                        TRUE,
                        ${user.id}
                    )
                `;

            } else {

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
                        ${Number(
                            body.id
                        )}
                `;
            }
        }


        /* =================================================
           INSURANCE
        ================================================= */

        else if (
            body.type ===
            'insurance'
        ) {

            const companyName =
                String(
                    body.company_name ||
                    ''
                ).trim();


            if (!companyName) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Insurance company name required.'
                    });
            }


            const shortName =
                String(
                    body.short_name ||
                    ''
                ).trim();


            const phone =
                String(
                    body.phone ||
                    ''
                ).trim();


            const email =
                String(
                    body.email ||
                    ''
                ).trim();


            const notes =
                String(
                    body.notes ||
                    ''
                ).trim();


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO insurance_companies (
                        company_name,
                        short_name,
                        phone,
                        email,
                        notes,
                        active
                    )

                    VALUES (
                        ${companyName},
                        ${shortName || null},
                        ${phone || null},
                        ${email || null},
                        ${notes || null},
                        TRUE
                    )
                `;

            } else {

                await sql`
                    UPDATE insurance_companies

                    SET
                        company_name =
                            ${companyName},

                        short_name =
                            ${shortName || null},

                        phone =
                            ${phone || null},

                        email =
                            ${email || null},

                        notes =
                            ${notes || null},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(
                            body.id
                        )}
                `;
            }
        }


        /* =================================================
           PAYMENT
        ================================================= */

        else if (
            body.type ===
            'payment'
        ) {

            const methodName =
                String(
                    body.method_name ||
                    ''
                ).trim();


            if (!methodName) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Payment method required.'
                    });
            }


            if (
                req.method === 'POST'
            ) {

                await sql`
                    INSERT INTO payment_methods (
                        method_name,
                        active,
                        created_by
                    )

                    VALUES (
                        ${methodName},
                        TRUE,
                        ${user.id}
                    )
                `;

            } else {

                await sql`
                    UPDATE payment_methods

                    SET
                        method_name =
                            ${methodName},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(
                            body.id
                        )}
                `;
            }
        }


        /* =================================================
           CURRENCY
        ================================================= */

        else if (
            body.type ===
            'currency'
        ) {

            const currencyCode =
                String(
                    body.currency_code ||
                    ''
                )
                .trim()
                .toUpperCase();


            const currencyName =
                String(
                    body.currency_name ||
                    ''
                ).trim();


            const symbol =
                String(
                    body.symbol ||
                    ''
                ).trim();


            const exchangeRate =
                Number(
                    body.exchange_rate
                );


            const isDefault =
                Boolean(
                    body.is_default
                );


            if (
                !currencyCode ||
                !currencyName
            ) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Currency code and name required.'
                    });
            }


            if (
                !Number.isFinite(
                    exchangeRate
                ) ||
                exchangeRate <= 0
            ) {

                return res
                    .status(400)
                    .json({
                        success:false,
                        message:
                            'Invalid exchange rate.'
                    });
            }


            /*
            Only one default currency.
            */

            if (isDefault) {

                await sql`
                    UPDATE currencies
                    SET is_default = FALSE
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
                        created_by
                    )

                    VALUES (
                        ${currencyCode},
                        ${currencyName},
                        ${symbol || null},
                        ${exchangeRate},
                        ${isDefault},
                        TRUE,
                        ${user.id}
                    )
                `;

            } else {

                await sql`
                    UPDATE currencies

                    SET
                        currency_code =
                            ${currencyCode},

                        currency_name =
                            ${currencyName},

                        symbol =
                            ${symbol || null},

                        exchange_rate =
                            ${exchangeRate},

                        is_default =
                            ${isDefault},

                        updated_at =
                            NOW()

                    WHERE id =
                        ${Number(
                            body.id
                        )}
                `;
            }
        }


        else {

            return res
                .status(400)
                .json({
                    success:false,
                    message:
                        'Invalid data type.'
                });
        }


        /* =================================================
           AUDIT
        ================================================= */

        await sql`
            INSERT INTO audit_logs (
                user_id,
                action,
                table_name,
                description
            )

            VALUES (
                ${user.id},
                'MASTER_DATA_UPDATE',
                ${body.type},
                ${'Master data changed by ' +
                  user.username}
            )
        `;


        return res
            .status(200)
            .json({
                success:true
            });


    } catch(error) {

        console.error(
            'MASTER DATA ERROR:',
            error
        );


        if (
            error.code ===
            '23505'
        ) {

            return res
                .status(409)
                .json({
                    success:false,
                    message:
                        'This item already exists.'
                });
        }


        return res
            .status(500)
            .json({
                success:false,
                message:
                    error.message ||
                    'Unable to save data.'
            });
    }
}
