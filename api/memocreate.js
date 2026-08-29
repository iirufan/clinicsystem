import sql from '../lib/db.js';


function num(value) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : 0;
}


function money(value) {

    return Math.round(
        (
            num(value) +
            Number.EPSILON
        )
        *
        100
    )
    /
    100;
}


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


    return user;
}


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
                String(
                    req.query.mode ||
                    ''
                );


            /* =================================================
               PAGE SETUP
            ================================================= */

            if (
                mode ===
                'setup'
            ) {


                /*
                 IMPORTANT CHANGE:

                 Doctors now come from USERS,
                 not from doctors table.
                */

                const doctors =
                    await sql`
                        SELECT

                            u.id,
                            u.full_name,
                            u.username,
                            u.doctor_id

                        FROM users u

                        WHERE

                            LOWER(u.role) =
                                'doctor'

                            AND u.approved =
                                TRUE

                            AND u.active =
                                TRUE

                        ORDER BY
                            u.full_name
                    `;


                const services =
                    await sql`
                        SELECT

                            id,
                            service_name,
                            price,
                            aasandha_price

                        FROM services

                        WHERE active =
                            TRUE

                        ORDER BY
                            service_name
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
                            AS charge_value

                        FROM insurance_companies

                        WHERE active =
                            TRUE

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

                        WHERE active =
                            TRUE

                        ORDER BY
                            method_name
                    `;


                /*
                 Appointments still support the older
                 doctor_id link.

                 Patient information comes from patients
                 when registered, otherwise appointment
                 temporary fields.
                */

                const appointments =
                    await sql`
                        SELECT

                            a.id,

                            a.patient_id,
                            a.doctor_id,
                            a.service_id,

                            a.appointment_date,
                            a.appointment_time,

                            a.status,
                            a.temporary_patient,

                            COALESCE(
                                p.full_name,
                                a.patient_name
                            )
                            AS patient_name,

                            COALESCE(
                                p.phone,
                                a.contact_no
                            )
                            AS contact_no,

                            p.patient_no,

                            p.id_passport_no,
                            p.passport_id,
                            p.national_id,

                            p.nationality,
                            p.date_of_birth

                        FROM appointments a

                        LEFT JOIN patients p
                        ON p.id =
                            a.patient_id

                        WHERE
                            a.status IN (
                                'BOOKED',
                                'ARRIVED'
                            )

                            AND
                            a.appointment_date >=
                            CURRENT_DATE - INTERVAL '2 days'

                        ORDER BY

                            a.appointment_date,

                            a.appointment_time
                    `;


                return res
                    .status(200)
                    .json({

                        success:true,

                        doctors,

                        services,

                        insuranceCompanies,

                        paymentMethods,

                        appointments
                    });
            }


            /* =================================================
               PATIENT SEARCH
            ================================================= */

            if (
                mode ===
                'patient-search'
            ) {

                const query =
                    String(
                        req.query.q ||
                        ''
                    )
                    .trim();


                if (!query) {

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Enter patient search information.'
                        });
                }


                /*
                 Partial matching.

                 This searches:

                 - patient number
                 - ID / Passport
                 - old passport field
                 - national ID
                 - full name
                 - phone
                */

                const search =
                    '%' +
                    query +
                    '%';


                const patients =
                    await sql`

                        SELECT

                            id,
                            patient_no,

                            id_passport_no,
                            passport_id,
                            national_id,

                            full_name,
                            phone,

                            date_of_birth,
                            nationality,
                            address

                        FROM patients

                        WHERE

                            active =
                                TRUE

                            AND (

                                COALESCE(
                                    patient_no,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    id_passport_no,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    passport_id,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    national_id,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    full_name,
                                    ''
                                )
                                ILIKE ${search}

                                OR

                                COALESCE(
                                    phone,
                                    ''
                                )
                                ILIKE ${search}
                            )

                        ORDER BY
                            full_name

                        LIMIT 50
                    `;


                return res
                    .status(200)
                    .json({

                        success:true,

                        patients
                    });
            }


            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'Invalid GET request.'
                });
        }


        /* =====================================================
           POST
        ===================================================== */

        if (
            req.method !==
            'POST'
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
                        'User access denied.'
                });
        }


        /* =====================================================
           SET RECEIPT NUMBER
        ===================================================== */

        if (
            body.action ===
            'set-receipt-next'
        ) {

            if (
                user.role !==
                'admin'
            ) {

                return res
                    .status(403)
                    .json({

                        success:false,

                        message:
                            'Administrator access required.'
                    });
            }


            const nextNumber =
                Number(
                    body.nextNumber
                );


            if (
                !Number.isInteger(
                    nextNumber
                )
                ||
                nextNumber <
                1
            ) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Invalid next receipt number.'
                    });
            }


            /*
             Prevent duplicate existing number.
            */

            const existing =
                await sql`
                    SELECT id

                    FROM memos

                    WHERE receipt_serial =
                        ${nextNumber}

                    LIMIT 1
                `;


            if (
                existing.length
            ) {

                return res
                    .status(409)
                    .json({

                        success:false,

                        message:
                            'That receipt number already exists.'
                    });
            }


            await sql`
                SELECT setval(
                    'memo_receipt_seq',
                    ${nextNumber},
                    FALSE
                )
            `;


            await sql`
                INSERT INTO audit_logs (

                    user_id,
                    action,
                    table_name,
                    description

                )

                VALUES (

                    ${user.id},

                    'SET_RECEIPT_NUMBER',

                    'memos',

                    ${
                        'Next receipt number set to '
                        +
                        nextNumber
                    }
                )
            `;


            return res
                .status(200)
                .json({

                    success:true
                });
        }


        /* =====================================================
           REGISTER PATIENT
        ===================================================== */

        if (
            body.action ===
            'register-patient'
        ) {

            const idPassport =
                String(
                    body.idPassport ||
                    ''
                ).trim();


            const fullName =
                String(
                    body.fullName ||
                    ''
                ).trim();


            const phone =
                String(
                    body.phone ||
                    ''
                ).trim();


            const nationality =
                String(
                    body.nationality ||
                    ''
                ).trim();


            const address =
                String(
                    body.address ||
                    ''
                ).trim();


            const dateOfBirth =
                body.dateOfBirth ||
                null;


            if (
                !idPassport ||
                !fullName ||
                !phone
            ) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'ID / Passport, patient name and contact number are required.'
                    });
            }


            const duplicate =
                await sql`
                    SELECT id

                    FROM patients

                    WHERE

                        LOWER(
                            COALESCE(
                                id_passport_no,
                                ''
                            )
                        )
                        =
                        LOWER(
                            ${idPassport}
                        )

                        OR

                        LOWER(
                            COALESCE(
                                passport_id,
                                ''
                            )
                        )
                        =
                        LOWER(
                            ${idPassport}
                        )

                        OR

                        LOWER(
                            COALESCE(
                                national_id,
                                ''
                            )
                        )
                        =
                        LOWER(
                            ${idPassport}
                        )

                    LIMIT 1
                `;


            if (
                duplicate.length
            ) {

                return res
                    .status(409)
                    .json({

                        success:false,

                        message:
                            'A patient with this ID / Passport already exists.'
                    });
            }


            /*
             Create temporary patient number first,
             then replace it with generated ID number.
            */

            const inserted =
                await sql`
                    INSERT INTO patients (

                        patient_no,

                        id_passport_no,

                        full_name,

                        phone,

                        date_of_birth,

                        nationality,

                        address,

                        active,

                        created_at,

                        updated_at

                    )

                    VALUES (

                        'TEMP',

                        ${idPassport},

                        ${fullName},

                        ${phone},

                        ${dateOfBirth},

                        ${
                            nationality ||
                            null
                        },

                        ${
                            address ||
                            null
                        },

                        TRUE,

                        NOW(),

                        NOW()
                    )

                    RETURNING id
                `;


            const patientId =
                inserted[0]
                    .id;


            const patientNo =
                'P'
                +
                String(
                    patientId
                ).padStart(
                    6,
                    '0'
                );


            await sql`
                UPDATE patients

                SET

                    patient_no =
                        ${patientNo},

                    updated_at =
                        NOW()

                WHERE id =
                    ${patientId}
            `;


            /*
             If patient came from temporary appointment,
             connect appointment to registration.
            */

            if (
                body.appointmentId
            ) {

                await sql`
                    UPDATE appointments

                    SET

                        patient_id =
                            ${patientId},

                        patient_name =
                            ${fullName},

                        contact_no =
                            ${phone},

                        temporary_patient =
                            FALSE,

                        updated_at =
                            NOW()

                    WHERE id =
                        ${
                            Number(
                                body.appointmentId
                            )
                        }
                `;
            }


            const patientRows =
                await sql`
                    SELECT

                        id,
                        patient_no,

                        id_passport_no,

                        full_name,

                        phone,

                        date_of_birth,

                        nationality,

                        address

                    FROM patients

                    WHERE id =
                        ${patientId}

                    LIMIT 1
                `;


            await sql`
                INSERT INTO audit_logs (

                    user_id,
                    action,
                    table_name,
                    record_id,
                    description

                )

                VALUES (

                    ${user.id},

                    'CREATE_PATIENT',

                    'patients',

                    ${patientId},

                    'Patient registered from memo page'
                )
            `;


            return res
                .status(201)
                .json({

                    success:true,

                    patient:
                        patientRows[0]
                });
        }


        /* =====================================================
           SAVE MEMO
        ===================================================== */

        if (
            body.action !==
            'save-memo'
        ) {

            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'Invalid action.'
                });
        }


        /* =====================================================
           PATIENT
        ===================================================== */

        const patientId =
            Number(
                body.patientId
            );


        if (!patientId) {

            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'Patient is required.'
                });
        }


        const patientRows =
            await sql`
                SELECT

                    id,
                    patient_no,
                    full_name,
                    phone,
                    nationality

                FROM patients

                WHERE

                    id =
                        ${patientId}

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

                    success:false,

                    message:
                        'Patient not found.'
                });
        }


        const patient =
            patientRows[0];


        const maldivian =
            String(
                patient.nationality ||
                ''
            )
            .trim()
            .toLowerCase()
            ===
            'maldivian';


        /* =====================================================
           DOCTOR FROM USERS
        ===================================================== */

        const doctorUserId =
            Number(
                body.doctorUserId
            );


        if (!doctorUserId) {

            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'Select a doctor.'
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

                    success:false,

                    message:
                        'Selected doctor is not available.'
                });
        }


        const doctorUser =
            doctorRows[0];


        /*
         doctor_id remains compatible with the old
         doctors table if this user has doctor_id assigned.

         doctor_user_id always records the doctor user.
        */

        const doctorTableId =
            doctorUser.doctor_id
            ?
            Number(
                doctorUser.doctor_id
            )
            :
            null;


        /* =====================================================
           SERVICES
        ===================================================== */

        const requestedServices =
            Array.isArray(
                body.services
            )
            ?
            body.services
            :
            [];


        if (
            !requestedServices.length
        ) {

            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'Add at least one service.'
                });
        }


        const serviceIds =
            requestedServices
                .map(
                    row =>
                        Number(
                            row.serviceId
                        )
                )
                .filter(Boolean);


        const serviceRows =
            await sql.query(
                `
                SELECT

                    id,
                    service_name,
                    price,
                    aasandha_price

                FROM services

                WHERE

                    active = TRUE

                    AND id =
                    ANY($1::bigint[])
                `,
                [
                    serviceIds
                ]
            );


        const serviceMap =
            new Map(
                serviceRows.map(
                    service => [

                        Number(
                            service.id
                        ),

                        service
                    ]
                )
            );


        let subtotal =
            0;


        let serviceDiscount =
            0;


        let serviceNet =
            0;


        let aasandhaEligible =
            0;


        const calculatedItems =
            [];


        for (
            const requested
            of requestedServices
        ) {

            const service =
                serviceMap.get(
                    Number(
                        requested.serviceId
                    )
                );


            if (!service) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Invalid service selected.'
                    });
            }


            const qty =
                Math.max(
                    1,
                    Math.floor(
                        num(
                            requested.qty
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
                    requested.discountMethod
                )
                ?
                requested.discountMethod
                :
                'none';


            const discountValue =
                Math.max(
                    0,
                    num(
                        requested.discountValue
                    )
                );


            let discountAmount =
                0;


            if (
                discountMethod ===
                'percent'
            ) {

                discountAmount =
                    lineSubtotal
                    *
                    Math.min(
                        100,
                        discountValue
                    )
                    /
                    100;

            }else if (
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


            const lineGovtEligible =
                money(
                    Math.min(
                        lineTotal,
                        govtRate *
                        qty
                    )
                );


            subtotal +=
                lineSubtotal;


            serviceDiscount +=
                discountAmount;


            serviceNet +=
                lineTotal;


            aasandhaEligible +=
                lineGovtEligible;


            calculatedItems.push({

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
           BILL DISCOUNT
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
            ?
            body.billDiscountMethod
            :
            'none';


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
                serviceNet
                *
                Math.min(
                    100,
                    billDiscountValue
                )
                /
                100;

        }else if (
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
            ?
            Number(
                body.primaryInsuranceId
            )
            :
            null;


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

            const insuranceRows =
                await sql`
                    SELECT

                        id,
                        company_name,

                        COALESCE(
                            is_government,
                            FALSE
                        )
                        AS is_government

                    FROM insurance_companies

                    WHERE

                        id =
                            ${primaryInsuranceId}

                        AND active =
                            TRUE

                    LIMIT 1
                `;


            if (
                !insuranceRows.length ||
                insuranceRows[0]
                    .is_government
            ) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Invalid primary insurance.'
                    });
            }


            primaryInsuranceName =
                insuranceRows[0]
                    .company_name;


            primaryInsuranceMethod =
                body.insuranceMethod ===
                'fixed'
                ?
                'fixed'
                :
                'percent';


            primaryInsuranceValue =
                Math.max(
                    0,
                    num(
                        body.insuranceValue
                    )
                );


            if (
                primaryInsuranceMethod ===
                'percent'
            ) {

                primaryInsuranceCover =
                    afterDiscount
                    *
                    Math.min(
                        100,
                        primaryInsuranceValue
                    )
                    /
                    100;

            }else {

                primaryInsuranceCover =
                    Math.min(
                        afterDiscount,
                        primaryInsuranceValue
                    );
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
           GOVERNMENT INSURANCE
        ===================================================== */

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
                        )
                        =
                        TRUE

                        AND active =
                            TRUE

                    ORDER BY id

                    LIMIT 1
                `;


            if (
                govtRows.length
            ) {

                governmentInsuranceId =
                    govtRows[0]
                        .id;


                const remainingAfterPrimary =
                    money(
                        Math.max(
                            0,
                            afterDiscount -
                            primaryInsuranceCover
                        )
                    );


                governmentInsuranceCover =
                    money(
                        Math.min(
                            remainingAfterPrimary,
                            aasandhaEligible
                        )
                    );
            }
        }


        const patientPayable =
            money(
                Math.max(
                    0,
                    afterDiscount
                    -
                    primaryInsuranceCover
                    -
                    governmentInsuranceCover
                )
            );


        /* =====================================================
           PAYMENT
        ===================================================== */

        let paymentMethodId =
            body.paymentMethodId
            ?
            Number(
                body.paymentMethodId
            )
            :
            null;


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

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Payment method required.'
                    });
            }


            const paymentRows =
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
                !paymentRows.length
            ) {

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Invalid payment method.'
                    });
            }


            paymentMethodName =
                paymentRows[0]
                    .method_name;


            const methodName =
                String(
                    paymentMethodName
                )
                .toLowerCase();


            const partialAllowed =
                methodName.includes(
                    'cash'
                )
                ||
                methodName.includes(
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

            }else {

                paidAmount =
                    patientPayable;
            }


            balanceAmount =
                money(
                    patientPayable -
                    paidAmount
                );
        }


        /* =====================================================
           RECEIPT NUMBER
        ===================================================== */

        const receiptRows =
            await sql`
                SELECT

                    nextval(
                        'memo_receipt_seq'
                    )
                    AS number
            `;


        const receiptSerial =
            Number(
                receiptRows[0]
                    .number
            );


        const receiptNo =
            String(
                receiptSerial
            ).padStart(
                6,
                '0'
            );


        /* =====================================================
           INSERT MEMO
        ===================================================== */

        const memoRows =
            await sql`

                INSERT INTO memos (

                    memo_no,

                    receipt_serial,
                    receipt_no,

                    patient_id,
                    patient_name,

                    doctor_id,
                    doctor_user_id,

                    appointment_id,

                    primary_insurance_id,
                    primary_insurance_method,
                    primary_insurance_value,
                    primary_insurance_cover,

                    government_insurance_id,
                    government_insurance_cover,

                    memo_date,

                    subtotal,

                    discount_amount,

                    bill_discount_method,
                    bill_discount_value,
                    bill_discount_amount,

                    insurance_amount,

                    patient_amount,

                    total_amount,

                    patient_payable,

                    paid_amount,

                    balance_amount,

                    payment_method_id,

                    payment_reference,

                    status,

                    remarks,

                    created_by,

                    created_at,

                    updated_at

                )

                VALUES (

                    ${'M-' + receiptNo},

                    ${receiptSerial},
                    ${receiptNo},

                    ${patient.id},
                    ${patient.full_name},

                    ${doctorTableId},
                    ${doctorUser.id},

                    ${
                        body.appointmentId
                        ?
                        Number(
                            body.appointmentId
                        )
                        :
                        null
                    },

                    ${primaryInsuranceId},

                    ${primaryInsuranceMethod},

                    ${primaryInsuranceValue},

                    ${primaryInsuranceCover},

                    ${governmentInsuranceId},

                    ${governmentInsuranceCover},

                    CURRENT_DATE,

                    ${subtotal},

                    ${
                        money(
                            serviceDiscount +
                            billDiscountAmount
                        )
                    },

                    ${billDiscountMethod},

                    ${billDiscountValue},

                    ${billDiscountAmount},

                    ${
                        money(
                            primaryInsuranceCover +
                            governmentInsuranceCover
                        )
                    },

                    ${patientPayable},

                    ${afterDiscount},

                    ${patientPayable},

                    ${paidAmount},

                    ${balanceAmount},

                    ${paymentMethodId},

                    ${
                        String(
                            body.paymentReference ||
                            ''
                        ).trim()
                        ||
                        null
                    },

                    ${
                        balanceAmount >
                        0
                        ?
                        'PARTIAL'
                        :
                        'PAID'
                    },

                    ${
                        String(
                            body.remarks ||
                            ''
                        ).trim()
                        ||
                        null
                    },

                    ${user.id},

                    NOW(),

                    NOW()
                )

                RETURNING id
            `;


        const memoId =
            memoRows[0]
                .id;


        /* =====================================================
           ITEMS
        ===================================================== */

        for (
            const item
            of calculatedItems
        ) {

            await sql`

                INSERT INTO memo_items (

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

                VALUES (

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
           PAYMENT RECORD
        ===================================================== */

        if (
            paidAmount >
            0
        ) {

            await sql`

                INSERT INTO payments (

                    memo_id,

                    patient_id,

                    payment_date,

                    amount,

                    payment_method,

                    reference_no,

                    received_by,

                    created_at

                )

                VALUES (

                    ${memoId},

                    ${patient.id},

                    CURRENT_DATE,

                    ${paidAmount},

                    ${paymentMethodName},

                    ${
                        String(
                            body.paymentReference ||
                            ''
                        ).trim()
                        ||
                        null
                    },

                    ${user.id},

                    NOW()
                )
            `;
        }


        /* =====================================================
           APPOINTMENT
        ===================================================== */

        if (
            body.appointmentId
        ) {

            await sql`

                UPDATE appointments

                SET

                    patient_id =
                        ${patient.id},

                    temporary_patient =
                        FALSE,

                    status =
                        'COMPLETED',

                    updated_at =
                        NOW()

                WHERE id =
                    ${
                        Number(
                            body.appointmentId
                        )
                    }
            `;
        }


        /* =====================================================
           AUDIT
        ===================================================== */

        await sql`

            INSERT INTO audit_logs (

                user_id,

                action,

                table_name,

                record_id,

                description

            )

            VALUES (

                ${user.id},

                'CREATE_MEMO',

                'memos',

                ${memoId},

                ${
                    'Memo created. Receipt '
                    +
                    receiptNo
                }
            )
        `;


        return res
            .status(201)
            .json({

                success:true,

                memo:{

                    id:
                        memoId,

                    receiptNo,

                    patientName:
                        patient.full_name,

                    patientNo:
                        patient.patient_no,

                    doctorName:
                        doctorUser.full_name,

                    memoDate:
                        new Date()
                            .toISOString()
                            .substring(
                                0,
                                10
                            ),

                    primaryInsuranceName,

                    subtotal,

                    totalDiscount:
                        money(
                            serviceDiscount +
                            billDiscountAmount
                        ),

                    primaryInsuranceCover,

                    governmentInsuranceCover,

                    patientPayable,

                    paidAmount,

                    balanceAmount,

                    items:
                        calculatedItems.map(
                            item => ({

                                serviceName:
                                    item.serviceName,

                                qty:
                                    item.qty,

                                price:
                                    item.price,

                                discountAmount:
                                    item.discountAmount,

                                lineTotal:
                                    item.lineTotal
                            })
                        )
                }
            });


    } catch(error) {

        console.error(
            'MEMOCREATE API ERROR:',
            error
        );


        return res
            .status(500)
            .json({

                success:false,

                message:
                    error.message ||
                    'Unable to process memo.'
            });
    }
}
