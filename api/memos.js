import sql from '../lib/db.js';


/* =========================================================
   HELPERS
========================================================= */

function num(value) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : 0;
}


function money(value) {

    return Math.round(
        (
            num(value) +
            Number.EPSILON
        ) * 100
    ) / 100;
}


function text(value) {

    return String(
        value ?? ''
    ).trim();
}


/* =========================================================
   VERIFY USER
========================================================= */

async function verifyUser(userId) {

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

            WHERE id = ${Number(userId)}

            LIMIT 1
        `;


    const user =
        rows[0];


    if (
        user &&
        user.approved &&
        user.active
    ) {

        return user;
    }


    return null;
}


/* =========================================================
   COMPANY SETTINGS
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
                    company_registration_no,
                    receipt_prefix,
                    receipt_next_number,
                    receipt_digits

                FROM clinic_settings

                WHERE id = 1

                LIMIT 1
            `;


        return rows[0] || {};

    } catch (error) {

        console.error(
            'COMPANY SETTINGS:',
            error
        );

        return {};
    }
}


/* =========================================================
   SETUP DATA
========================================================= */

async function getSetupData() {

    const doctors =
        await sql`
            SELECT
                id,
                full_name,
                username,
                doctor_id

            FROM users

            WHERE
                LOWER(role) = 'doctor'
                AND approved = TRUE
                AND active = TRUE

            ORDER BY full_name
        `;


    const services =
        await sql`
            SELECT
                id,
                service_name,
                price,
                aasandha_price

            FROM services

            WHERE active = TRUE

            ORDER BY service_name
        `;


    const insuranceCompanies =
        await sql`
            SELECT
                id,
                company_code,
                company_name,
                short_name,

                COALESCE(
                    is_government,
                    FALSE
                ) AS is_government,

                COALESCE(
                    charge_method,
                    'percent'
                ) AS charge_method,

                COALESCE(
                    charge_value,
                    0
                ) AS charge_value

            FROM insurance_companies

            WHERE active = TRUE

            ORDER BY
                is_government,
                company_name
        `;


    const paymentMethods =
        await sql`
            SELECT
                id,
                method_name

            FROM payment_methods

            WHERE active = TRUE

            ORDER BY method_name
        `;


    return {

        doctors,

        services,

        insuranceCompanies,

        paymentMethods,

        company:
            await getCompany()
    };
}


/* =========================================================
   GET ONE MEMO
========================================================= */

async function getMemoDetail(id) {

    const rows =
        await sql`
            SELECT

                m.*,

                p.patient_no,
                p.id_passport_no,
                p.passport_id,
                p.national_id,
                p.full_name,
                p.phone,
                p.email,
                p.date_of_birth,
                p.nationality,
                p.address,

                COALESCE(
                    du.full_name,
                    d.full_name
                ) AS doctor_name,

                ic.company_name
                    AS primary_insurance_name,

                pm.method_name
                    AS payment_method_name

            FROM memos m

            LEFT JOIN patients p
                ON p.id = m.patient_id

            LEFT JOIN users du
                ON du.id = m.doctor_user_id

            LEFT JOIN doctors d
                ON d.id = m.doctor_id

            LEFT JOIN insurance_companies ic
                ON ic.id =
                    m.primary_insurance_id

            LEFT JOIN payment_methods pm
                ON pm.id =
                    m.payment_method_id

            WHERE m.id =
                ${Number(id)}

            LIMIT 1
        `;


    if (!rows.length) {

        return null;
    }


    const memo =
        rows[0];


    /* =====================================================
       ITEMS
    ===================================================== */

    const items =
        await sql`
            SELECT
                id,
                service_id,
                service_name,
                description,
                quantity,
                unit_price,
                base_price,
                aasandha_unit_price,
                line_subtotal,
                discount_method,
                discount_value,
                discount_amount,
                amount,
                line_total

            FROM memo_items

            WHERE memo_id =
                ${Number(id)}

            ORDER BY id
        `;


    return {

        ...memo,

        items,

        company:
            await getCompany(),

        patient: {

            id:
                memo.patient_id,

            patient_no:
                memo.patient_no,

            id_passport_no:
                memo.id_passport_no,

            passport_id:
                memo.passport_id,

            national_id:
                memo.national_id,

            full_name:
                memo.full_name ||
                memo.patient_name,

            phone:
                memo.phone,

            email:
                memo.email,

            date_of_birth:
                memo.date_of_birth,

            nationality:
                memo.nationality,

            address:
                memo.address
        }
    };
}


/* =========================================================
   CALCULATE EDITED MEMO
========================================================= */

async function calculateMemo(
    body,
    patient
) {

    const requested =
        Array.isArray(
            body.services
        )
            ? body.services
            : [];


    if (!requested.length) {

        throw new Error(
            'Add at least one service.'
        );
    }


    /* =====================================================
       LOAD SERVICES

       Important:
       Uses Neon tagged template.
       No sql.query().
    ===================================================== */

    const serviceIds =
        [
            ...new Set(
                requested
                    .map(
                        item =>
                            Number(
                                item.serviceId
                            )
                    )
                    .filter(Boolean)
            )
        ];


    const serviceMap =
        new Map();


    for (
        const serviceId
        of serviceIds
    ) {

        const rows =
            await sql`
                SELECT
                    id,
                    service_name,
                    price,
                    aasandha_price

                FROM services

                WHERE
                    id = ${serviceId}
                    AND active = TRUE

                LIMIT 1
            `;


        if (rows[0]) {

            serviceMap.set(
                Number(
                    rows[0].id
                ),
                rows[0]
            );
        }
    }


    let subtotal = 0;

    let serviceDiscount = 0;

    let serviceNet = 0;

    let aasandhaEligible = 0;


    const items = [];


    /* =====================================================
       SERVICE CALCULATIONS
    ===================================================== */

    for (
        const requestItem
        of requested
    ) {

        const service =
            serviceMap.get(
                Number(
                    requestItem.serviceId
                )
            );


        if (!service) {

            throw new Error(
                'Invalid service selected.'
            );
        }


        const qty =
            Math.max(
                1,
                Math.floor(
                    num(
                        requestItem.qty
                    )
                )
            );


        const price =
            money(
                service.price
            );


        const govtRate =
            money(
                service.aasandha_price
            );


        const lineSubtotal =
            money(
                price *
                qty
            );


        const discountMethod =
            [
                'none',
                'percent',
                'fixed'
            ]
            .includes(
                requestItem.discountMethod
            )
                ? requestItem.discountMethod
                : 'none';


        const discountValue =
            Math.max(
                0,
                num(
                    requestItem.discountValue
                )
            );


        let discountAmount =
            0;


        if (
            discountMethod ===
            'percent'
        ) {

            discountAmount =
                lineSubtotal *
                Math.min(
                    100,
                    discountValue
                ) /
                100;

        } else if (
            discountMethod ===
            'fixed'
        ) {

            discountAmount =
                Math.min(
                    lineSubtotal,
                    discountValue
                );
        }


        discountAmount =
            money(
                discountAmount
            );


        const lineTotal =
            money(
                Math.max(
                    0,
                    lineSubtotal -
                    discountAmount
                )
            );


        subtotal +=
            lineSubtotal;


        serviceDiscount +=
            discountAmount;


        serviceNet +=
            lineTotal;


        aasandhaEligible +=
            Math.min(
                lineTotal,
                govtRate *
                qty
            );


        items.push({

            serviceId:
                Number(
                    service.id
                ),

            serviceName:
                service.service_name,

            qty,

            price,

            govtRate,

            lineSubtotal,

            discountMethod,

            discountValue,

            discountAmount,

            lineTotal
        });
    }


    subtotal =
        money(
            subtotal
        );


    serviceDiscount =
        money(
            serviceDiscount
        );


    serviceNet =
        money(
            serviceNet
        );


    aasandhaEligible =
        money(
            aasandhaEligible
        );


    /* =====================================================
       WHOLE BILL DISCOUNT
    ===================================================== */

    const billDiscountMethod =
        [
            'none',
            'percent',
            'fixed'
        ]
        .includes(
            body.billDiscountMethod
        )
            ? body.billDiscountMethod
            : 'none';


    const billDiscountValue =
        Math.max(
            0,
            num(
                body.billDiscountValue
            )
        );


    let billDiscountAmount =
        0;


    if (
        billDiscountMethod ===
        'percent'
    ) {

        billDiscountAmount =
            serviceNet *
            Math.min(
                100,
                billDiscountValue
            ) /
            100;

    } else if (
        billDiscountMethod ===
        'fixed'
    ) {

        billDiscountAmount =
            Math.min(
                serviceNet,
                billDiscountValue
            );
    }


    billDiscountAmount =
        money(
            billDiscountAmount
        );


    const afterDiscount =
        money(
            Math.max(
                0,
                serviceNet -
                billDiscountAmount
            )
        );


    /* =====================================================
       PRIMARY INSURANCE
    ===================================================== */

    let primaryInsuranceId =
        body.primaryInsuranceId
            ? Number(
                body.primaryInsuranceId
            )
            : null;


    let primaryInsuranceName =
        null;


    let primaryInsuranceMethod =
        null;


    let primaryInsuranceValue =
        0;


    let primaryInsuranceCover =
        0;


    if (
        primaryInsuranceId
    ) {

        const rows =
            await sql`
                SELECT
                    id,
                    company_name,

                    COALESCE(
                        is_government,
                        FALSE
                    ) AS is_government

                FROM insurance_companies

                WHERE
                    id =
                        ${primaryInsuranceId}

                    AND active =
                        TRUE

                LIMIT 1
            `;


        if (
            !rows.length ||
            rows[0].is_government
        ) {

            throw new Error(
                'Invalid primary insurance.'
            );
        }


        primaryInsuranceName =
            rows[0]
                .company_name;


        primaryInsuranceMethod =
            body.insuranceMethod ===
            'fixed'
                ? 'fixed'
                : 'percent';


        primaryInsuranceValue =
            Math.max(
                0,
                num(
                    body.insuranceValue
                )
            );


        if (
            primaryInsuranceMethod ===
            'fixed'
        ) {

            primaryInsuranceCover =
                Math.min(
                    afterDiscount,
                    primaryInsuranceValue
                );

        } else {

            primaryInsuranceCover =
                afterDiscount *
                Math.min(
                    100,
                    primaryInsuranceValue
                ) /
                100;
        }


        primaryInsuranceCover =
            money(
                Math.min(
                    afterDiscount,
                    primaryInsuranceCover
                )
            );
    }


    /* =====================================================
       AASANDHA
    ===================================================== */

    const maldivian =
        text(
            patient.nationality
        )
        .toLowerCase() ===
        'maldivian';


    let governmentInsuranceId =
        null;


    let governmentInsuranceCover =
        0;


    if (
        maldivian
    ) {

        const govtRows =
            await sql`
                SELECT id

                FROM insurance_companies

                WHERE
                    COALESCE(
                        is_government,
                        FALSE
                    ) = TRUE

                    AND active =
                        TRUE

                ORDER BY id

                LIMIT 1
            `;


        if (
            govtRows.length
        ) {

            governmentInsuranceId =
                Number(
                    govtRows[0].id
                );


            const remaining =
                Math.max(
                    0,
                    afterDiscount -
                    primaryInsuranceCover
                );


            governmentInsuranceCover =
                money(
                    Math.min(
                        remaining,
                        aasandhaEligible
                    )
                );
        }
    }


    /* =====================================================
       PATIENT PAYABLE
    ===================================================== */

    const patientPayable =
        money(
            Math.max(
                0,

                afterDiscount -
                primaryInsuranceCover -
                governmentInsuranceCover
            )
        );


    /* =====================================================
       PAYMENT
    ===================================================== */

    let paymentMethodId =
        body.paymentMethodId
            ? Number(
                body.paymentMethodId
            )
            : null;


    let paymentMethodName =
        null;


    let paidAmount =
        0;


    let balanceAmount =
        patientPayable;


    if (
        patientPayable >
        0
    ) {

        if (
            !paymentMethodId
        ) {

            throw new Error(
                'Payment method required.'
            );
        }


        const rows =
            await sql`
                SELECT
                    id,
                    method_name

                FROM payment_methods

                WHERE
                    id =
                        ${paymentMethodId}

                    AND active =
                        TRUE

                LIMIT 1
            `;


        if (
            !rows.length
        ) {

            throw new Error(
                'Invalid payment method.'
            );
        }


        paymentMethodName =
            rows[0]
                .method_name;


        const paymentName =
            text(
                paymentMethodName
            )
            .toLowerCase();


        const partialAllowed =
            paymentName.includes(
                'cash'
            ) ||
            paymentName.includes(
                'transfer'
            );


        if (
            partialAllowed
        ) {

            paidAmount =
                money(
                    Math.min(
                        patientPayable,

                        Math.max(
                            0,
                            num(
                                body.amountPaid
                            )
                        )
                    )
                );

        } else {

            paidAmount =
                patientPayable;
        }


        balanceAmount =
            money(
                patientPayable -
                paidAmount
            );

    } else {

        paymentMethodId =
            null;
    }


    return {

        items,

        subtotal,

        serviceDiscount,

        billDiscountMethod,

        billDiscountValue,

        billDiscountAmount,

        afterDiscount,

        primaryInsuranceId,

        primaryInsuranceName,

        primaryInsuranceMethod,

        primaryInsuranceValue,

        primaryInsuranceCover,

        governmentInsuranceId,

        governmentInsuranceCover,

        patientPayable,

        paymentMethodId,

        paymentMethodName,

        paidAmount,

        balanceAmount
    };
}


/* =========================================================
   API HANDLER
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
            req.method ===
            'GET'
        ) {

            const mode =
                text(
                    req.query.mode
                );


            /* =================================================
               SETUP
            ================================================= */

            if (
                mode ===
                'setup'
            ) {

                const data =
                    await getSetupData();


                return res
                    .status(200)
                    .json({

                        success:
                            true,

                        ...data
                    });
            }


            /* =================================================
               SEARCH
            ================================================= */

            if (
                mode ===
                'search'
            ) {

                const q =
                    text(
                        req.query.q
                    );


                const search =
                    '%' +
                    q +
                    '%';


                const from =
                    text(
                        req.query.from
                    ) ||
                    null;


                const to =
                    text(
                        req.query.to
                    ) ||
                    null;


                const status =
                    text(
                        req.query.status
                    ) ||
                    null;


                const rows =
                    await sql`
                        SELECT

                            m.id,
                            m.memo_no,
                            m.receipt_no,
                            m.memo_date,
                            m.status,
                            m.patient_name,

                            m.total_amount,
                            m.patient_payable,
                            m.paid_amount,
                            m.balance_amount,

                            p.patient_no,
                            p.id_passport_no,
                            p.passport_id,
                            p.national_id,
                            p.phone,

                            COALESCE(
                                du.full_name,
                                d.full_name
                            ) AS doctor_name,

                            ic.company_name
                                AS insurance_name

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


                        WHERE

                            (
                                ${q} = ''

                                OR

                                COALESCE(
                                    m.receipt_no,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    m.memo_no,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    m.patient_name,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    p.patient_no,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    p.id_passport_no,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    p.passport_id,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    p.national_id,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    p.phone,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    du.full_name,
                                    d.full_name,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    ic.company_name,
                                    ''
                                )
                                ILIKE ${search}
                            )


                            AND
                            (
                                ${from}::date
                                IS NULL

                                OR

                                m.memo_date >=
                                    ${from}::date
                            )


                            AND
                            (
                                ${to}::date
                                IS NULL

                                OR

                                m.memo_date <=
                                    ${to}::date
                            )


                            AND
                            (
                                ${status}::text
                                IS NULL

                                OR

                                m.status =
                                    ${status}
                            )


                        ORDER BY
                            m.memo_date DESC,
                            m.id DESC


                        LIMIT 500
                    `;


                return res
                    .status(200)
                    .json({

                        success:
                            true,

                        memos:
                            rows
                    });
            }


            /* =================================================
               DETAIL
            ================================================= */

            if (
                mode ===
                'detail'
            ) {

                const memo =
                    await getMemoDetail(
                        req.query.id
                    );


                if (
                    !memo
                ) {

                    return res
                        .status(404)
                        .json({

                            success:
                                false,

                            message:
                                'Memo not found.'
                        });
                }


                return res
                    .status(200)
                    .json({

                        success:
                            true,

                        memo
                    });
            }


            return res
                .status(400)
                .json({

                    success:
                        false,

                    message:
                        'Invalid GET request.'
                });
        }


        /* =====================================================
           ONLY PUT BELOW
        ===================================================== */

        if (
            req.method !==
            'PUT'
        ) {

            return res
                .status(405)
                .json({

                    success:
                        false,

                    message:
                        'Method not allowed.'
                });
        }


        const body =
            req.body ||
            {};


        /* =====================================================
           USER
        ===================================================== */

        const user =
            await verifyUser(
                body.userId
            );


        if (
            !user
        ) {

            return res
                .status(403)
                .json({

                    success:
                        false,

                    message:
                        'User access denied.'
                });
        }


        /* =====================================================
           MEMO
        ===================================================== */

        const memoId =
            Number(
                body.memoId
            );


        if (
            !memoId
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    message:
                        'Memo ID is required.'
                });
        }


        const oldRows =
            await sql`
                SELECT
                    id,
                    patient_id,
                    receipt_no,
                    receipt_serial,
                    memo_no

                FROM memos

                WHERE id =
                    ${memoId}

                LIMIT 1
            `;


        if (
            !oldRows.length
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    message:
                        'Memo not found.'
                });
        }


        const oldMemo =
            oldRows[0];


        /*
         Notice:
         receipt_no is NOT updated anywhere below.

         Editing therefore keeps the original
         receipt number.
        */


        /* =====================================================
           PATIENT
        ===================================================== */

        const patientRows =
            await sql`
                SELECT
                    id,
                    full_name,
                    patient_no,
                    nationality

                FROM patients

                WHERE
                    id =
                        ${Number(
                            oldMemo.patient_id
                        )}

                    AND active =
                        TRUE

                LIMIT 1
            `;


        if (
            !patientRows.length
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    message:
                        'Patient not found.'
                });
        }


        const patient =
            patientRows[0];


        /* =====================================================
           DOCTOR
        ===================================================== */

        const doctorUserId =
            Number(
                body.doctorUserId
            );


        if (
            !doctorUserId
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    message:
                        'Doctor is required.'
                });
        }


        const doctorRows =
            await sql`
                SELECT
                    id,
                    full_name,
                    doctor_id

                FROM users

                WHERE
                    id =
                        ${doctorUserId}

                    AND LOWER(role) =
                        'doctor'

                    AND approved =
                        TRUE

                    AND active =
                        TRUE

                LIMIT 1
            `;


        if (
            !doctorRows.length
        ) {

            return res
                .status(400)
                .json({

                    success:
                        false,

                    message:
                        'Selected doctor is not available.'
                });
        }


        const doctor =
            doctorRows[0];


        const doctorTableId =
            doctor.doctor_id
                ? Number(
                    doctor.doctor_id
                )
                : null;


        /* =====================================================
           CALCULATE
        ===================================================== */

        const calculation =
            await calculateMemo(
                body,
                patient
            );


        /* =====================================================
           UPDATE MEMO HEADER

           receipt_no / receipt_serial are intentionally
           NOT changed.
        ===================================================== */

        await sql`
            UPDATE memos

            SET

                doctor_id =
                    ${doctorTableId},

                doctor_user_id =
                    ${doctor.id},

                primary_insurance_id =
                    ${
                        calculation
                            .primaryInsuranceId
                    },

                primary_insurance_method =
                    ${
                        calculation
                            .primaryInsuranceMethod
                    },

                primary_insurance_value =
                    ${
                        calculation
                            .primaryInsuranceValue
                    },

                primary_insurance_cover =
                    ${
                        calculation
                            .primaryInsuranceCover
                    },

                government_insurance_id =
                    ${
                        calculation
                            .governmentInsuranceId
                    },

                government_insurance_cover =
                    ${
                        calculation
                            .governmentInsuranceCover
                    },

                subtotal =
                    ${
                        calculation
                            .subtotal
                    },

                discount_amount =
                    ${
                        money(
                            calculation
                                .serviceDiscount
                            +
                            calculation
                                .billDiscountAmount
                        )
                    },

                bill_discount_method =
                    ${
                        calculation
                            .billDiscountMethod
                    },

                bill_discount_value =
                    ${
                        calculation
                            .billDiscountValue
                    },

                bill_discount_amount =
                    ${
                        calculation
                            .billDiscountAmount
                    },

                insurance_amount =
                    ${
                        money(
                            calculation
                                .primaryInsuranceCover
                            +
                            calculation
                                .governmentInsuranceCover
                        )
                    },

                patient_amount =
                    ${
                        calculation
                            .patientPayable
                    },

                total_amount =
                    ${
                        calculation
                            .afterDiscount
                    },

                patient_payable =
                    ${
                        calculation
                            .patientPayable
                    },

                paid_amount =
                    ${
                        calculation
                            .paidAmount
                    },

                balance_amount =
                    ${
                        calculation
                            .balanceAmount
                    },

                payment_method_id =
                    ${
                        calculation
                            .paymentMethodId
                    },

                payment_reference =
                    ${
                        text(
                            body.paymentReference
                        ) ||
                        null
                    },

                status =
                    ${
                        calculation
                            .balanceAmount >
                        0
                            ? 'PARTIAL'
                            : 'PAID'
                    },

                remarks =
                    ${
                        text(
                            body.remarks
                        ) ||
                        null
                    },

                updated_at =
                    NOW()

            WHERE id =
                ${memoId}
        `;


        /* =====================================================
           DELETE OLD MEMO ITEMS
        ===================================================== */

        await sql`
            DELETE FROM memo_items

            WHERE memo_id =
                ${memoId}
        `;


        /* =====================================================
           INSERT UPDATED ITEMS
        ===================================================== */

        for (
            const item
            of calculation.items
        ) {

            await sql`
                INSERT INTO memo_items
                (
                    memo_id,

                    service_id,
                    service_name,
                    description,

                    quantity,

                    unit_price,
                    base_price,

                    aasandha_unit_price,

                    line_subtotal,

                    discount_method,
                    discount_value,
                    discount_amount,

                    amount,
                    line_total,

                    created_at
                )

                VALUES
                (
                    ${memoId},

                    ${item.serviceId},
                    ${item.serviceName},
                    ${item.serviceName},

                    ${item.qty},

                    ${item.price},
                    ${item.price},

                    ${item.govtRate},

                    ${item.lineSubtotal},

                    ${item.discountMethod},
                    ${item.discountValue},
                    ${item.discountAmount},

                    ${item.lineTotal},
                    ${item.lineTotal},

                    NOW()
                )
            `;
        }


        /* =====================================================
           UPDATE PAYMENT

           For this version we rebuild the payment record
           from the current memo payment.
        ===================================================== */

        await sql`
            DELETE FROM payments

            WHERE memo_id =
                ${memoId}
        `;


        if (
            calculation.paidAmount >
            0
        ) {

            await sql`
                INSERT INTO payments
                (
                    memo_id,
                    patient_id,

                    payment_date,

                    amount,

                    payment_method,

                    reference_no,

                    received_by,

                    created_at
                )

                VALUES
                (
                    ${memoId},

                    ${patient.id},

                    (
                        NOW()
                        AT TIME ZONE
                        'Indian/Maldives'
                    )::date,

                    ${
                        calculation
                            .paidAmount
                    },

                    ${
                        calculation
                            .paymentMethodName
                    },

                    ${
                        text(
                            body.paymentReference
                        ) ||
                        null
                    },

                    ${user.id},

                    NOW()
                )
            `;
        }


        /* =====================================================
           AUDIT LOG

           Do not make memo editing fail only because an
           optional audit insert fails.
        ===================================================== */

        try {

            await sql`
                INSERT INTO audit_logs
                (
                    user_id,

                    action,

                    table_name,

                    record_id,

                    description
                )

                VALUES
                (
                    ${user.id},

                    'UPDATE_MEMO',

                    'memos',

                    ${memoId},

                    ${
                        'Memo updated. Receipt ' +
                        (
                            oldMemo.receipt_no ||
                            oldMemo.memo_no ||
                            memoId
                        )
                    }
                )
            `;

        } catch (
            auditError
        ) {

            console.error(
                'AUDIT LOG ERROR:',
                auditError
            );
        }


        /* =====================================================
           RETURN UPDATED MEMO
        ===================================================== */

        const memo =
            await getMemoDetail(
                memoId
            );


        return res
            .status(200)
            .json({

                success:
                    true,

                message:
                    'Memo updated successfully.',

                memo
            });


    } catch (
        error
    ) {

        console.error(
            'MEMOS API ERROR:',
            error
        );


        return res
            .status(500)
            .json({

                success:
                    false,

                message:
                    error.message ||
                    'Unable to process memo.'
            });
    }
}
