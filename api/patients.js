import sql from '../lib/db.js';


async function verifyUser(userId){

    const rows =
        await sql`
            SELECT
                id,
                username,
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
    ){

        return null;
    }


    return user;
}


export default async function handler(
    req,
    res
){

    try{

        /* =================================================
           GET
        ================================================= */

        if (
            req.method === 'GET'
        ){

            if (
                req.query.mode ===
                'temporary-appointments'
            ){

                const appointments =
                    await sql`
                        SELECT

                            a.id,
                            a.patient_name,
                            a.contact_no,
                            a.appointment_date,
                            a.appointment_time,

                            d.full_name
                                AS doctor_name,

                            s.service_name

                        FROM appointments a

                        LEFT JOIN doctors d
                        ON d.id =
                            a.doctor_id

                        LEFT JOIN services s
                        ON s.id =
                            a.service_id

                        WHERE

                            a.temporary_patient =
                                TRUE

                            AND a.patient_id
                                IS NULL

                            AND a.status NOT IN (
                                'CANCELLED',
                                'NO_SHOW'
                            )

                        ORDER BY

                            a.appointment_date,

                            a.appointment_time
                    `;


                return res
                    .status(200)
                    .json({

                        success:true,

                        appointments
                    });
            }


            const query =
                String(
                    req.query.q ||
                    ''
                ).trim();


            let patients;


            if (query){

                const search =
                    '%' +
                    query +
                    '%';


                patients =
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
                            address,
                            active,
                            created_at

                        FROM patients

                        WHERE active = TRUE

                        AND (

                            patient_no
                                ILIKE ${search}

                            OR

                            full_name
                                ILIKE ${search}

                            OR

                            phone
                                ILIKE ${search}

                            OR

                            id_passport_no
                                ILIKE ${search}

                            OR

                            passport_id
                                ILIKE ${search}

                            OR

                            national_id
                                ILIKE ${search}

                        )

                        ORDER BY
                            full_name

                        LIMIT 100
                    `;

            }else{

                patients =
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
                            address,
                            active,
                            created_at

                        FROM patients

                        WHERE active = TRUE

                        ORDER BY
                            created_at DESC

                        LIMIT 100
                    `;
            }


            return res
                .status(200)
                .json({

                    success:true,

                    patients
                });
        }


        /* =================================================
           POST / PUT
        ================================================= */

        if (
            req.method !== 'POST' &&
            req.method !== 'PUT'
        ){

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


        if (!user){

            return res
                .status(403)
                .json({

                    success:false,

                    message:
                        'User access denied.'
                });
        }


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


        const dateOfBirth =
            body.dateOfBirth ||
            null;


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


        if (
            !idPassport ||
            !fullName ||
            !phone
        ){

            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'ID/Passport, patient name and contact number are required.'
                });
        }


        /* DUPLICATE */

        const currentId =
            body.id
            ?
            Number(
                body.id
            )
            :
            null;


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

                    AND (
                        ${currentId}::bigint
                        IS NULL

                        OR id !=
                        ${currentId}
                    )

                LIMIT 1
            `;


        if (
            duplicate.length
        ){

            return res
                .status(409)
                .json({

                    success:false,

                    message:
                        'A patient with this ID Card / Passport already exists.'
                });
        }


        let patientId;


        /* =================================================
           CREATE
        ================================================= */

        if (
            req.method === 'POST'
        ){

            /*
              More reliable than MAX(id)+1 for display:
              use the actual sequence generated ID,
              then update patient_no.
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
                        ${nationality || null},
                        ${address || null},
                        TRUE,
                        NOW(),
                        NOW()

                    )

                    RETURNING id
                `;


            patientId =
                inserted[0].id;


            const patientNo =
                'P' +
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


            /* =============================================
               LINK TEMPORARY APPOINTMENT
            ============================================= */

            if (
                body.sourceAppointmentId
            ){

                const appointmentId =
                    Number(
                        body.sourceAppointmentId
                    );


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

                    WHERE

                        id =
                            ${appointmentId}

                        AND temporary_patient =
                            TRUE
                `;
            }


            /*
              Also link any other matching temporary
              appointments with the same contact number.
            */

            await sql`
                UPDATE appointments

                SET

                    patient_id =
                        ${patientId},

                    patient_name =
                        ${fullName},

                    temporary_patient =
                        FALSE,

                    updated_at =
                        NOW()

                WHERE

                    patient_id IS NULL

                    AND temporary_patient =
                        TRUE

                    AND contact_no =
                        ${phone}

                    AND LOWER(
                        patient_name
                    )
                    =
                    LOWER(
                        ${fullName}
                    )
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
                    'Patient registered'

                )
            `;
        }


        /* =================================================
           UPDATE
        ================================================= */

        else{

            patientId =
                Number(
                    body.id
                );


            if (!patientId){

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Invalid patient.'
                    });
            }


            await sql`
                UPDATE patients

                SET

                    id_passport_no =
                        ${idPassport},

                    full_name =
                        ${fullName},

                    phone =
                        ${phone},

                    date_of_birth =
                        ${dateOfBirth},

                    nationality =
                        ${nationality || null},

                    address =
                        ${address || null},

                    updated_at =
                        NOW()

                WHERE id =
                    ${patientId}
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
                    'UPDATE_PATIENT',
                    'patients',
                    ${patientId},
                    'Patient information updated'

                )
            `;
        }


        return res
            .status(200)
            .json({

                success:true,

                patientId
            });


    }catch(error){

        console.error(
            'PATIENT API ERROR:',
            error
        );


        if (
            error.code ===
            '23505'
        ){

            return res
                .status(409)
                .json({

                    success:false,

                    message:
                        'This patient already exists.'
                });
        }


        return res
            .status(500)
            .json({

                success:false,

                message:
                    error.message ||
                    'Unable to process patient.'
            });
    }
}
