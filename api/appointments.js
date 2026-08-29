import sql from '../lib/db.js';


async function verifyUser(userId){

    if (!userId){
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

            const mode =
                String(
                    req.query.mode ||
                    ''
                );


            /* =============================================
               PAGE DATA
            ============================================= */

            if (
                mode === 'setup'
            ){

                const doctors =
                    await sql`
                        SELECT
                            id,
                            full_name,
                            speciality

                        FROM doctors

                        WHERE active = TRUE

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


                const todayAppointments =
                    await sql`
                        SELECT

                            a.id,
                            a.appointment_time,
                            a.status,
                            a.temporary_patient,
                            a.contact_no,

                            COALESCE(
                                p.full_name,
                                a.patient_name
                            ) AS patient_name,

                            d.full_name
                                AS doctor_name,

                            s.service_name

                        FROM appointments a

                        LEFT JOIN patients p
                        ON p.id =
                            a.patient_id

                        LEFT JOIN doctors d
                        ON d.id =
                            a.doctor_id

                        LEFT JOIN services s
                        ON s.id =
                            a.service_id

                        WHERE
                            a.appointment_date =
                            CURRENT_DATE

                        ORDER BY
                            a.appointment_time
                    `;


                return res
                    .status(200)
                    .json({

                        success:true,

                        doctors,

                        services,

                        todayAppointments
                    });
            }


            /* =============================================
               PATIENT SEARCH
            ============================================= */

            if (
                mode ===
                'patient-search'
            ){

                const query =
                    String(
                        req.query.q ||
                        ''
                    ).trim();


                if (!query){

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'ID Card / Passport number required.'
                        });
                }


                const rows =
                    await sql`
                        SELECT

                            id,
                            patient_no,
                            id_passport_no,
                            passport_id,
                            national_id,
                            full_name,
                            date_of_birth,
                            phone,
                            address,
                            nationality

                        FROM patients

                        WHERE active = TRUE

                        AND (

                            LOWER(
                                COALESCE(
                                    id_passport_no,
                                    ''
                                )
                            )
                            =
                            LOWER(${query})

                            OR

                            LOWER(
                                COALESCE(
                                    passport_id,
                                    ''
                                )
                            )
                            =
                            LOWER(${query})

                            OR

                            LOWER(
                                COALESCE(
                                    national_id,
                                    ''
                                )
                            )
                            =
                            LOWER(${query})

                        )

                        LIMIT 1
                    `;


                return res
                    .status(200)
                    .json({

                        success:true,

                        patient:
                            rows[0] ||
                            null
                    });
            }


            return res
                .status(400)
                .json({

                    success:false,

                    message:
                        'Invalid request.'
                });
        }


        /* =================================================
           CREATE APPOINTMENT
        ================================================= */

        if (
            req.method === 'POST'
        ){

            const body =
                req.body ||
                {};


            const userId =
                Number(
                    body.userId
                );


            const user =
                await verifyUser(
                    userId
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


            const doctorId =
                Number(
                    body.doctorId
                );


            const serviceId =
                body.serviceId
                ?
                Number(
                    body.serviceId
                )
                :
                null;


            const appointmentDate =
                String(
                    body.appointmentDate ||
                    ''
                );


            const appointmentTime =
                String(
                    body.appointmentTime ||
                    ''
                );


            const notes =
                String(
                    body.notes ||
                    ''
                ).trim();


            if (
                !doctorId ||
                !appointmentDate ||
                !appointmentTime
            ){

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Doctor, date and time are required.'
                    });
            }


            /* DOCTOR */

            const doctor =
                await sql`
                    SELECT id

                    FROM doctors

                    WHERE
                        id =
                            ${doctorId}

                        AND active =
                            TRUE

                    LIMIT 1
                `;


            if (!doctor.length){

                return res
                    .status(400)
                    .json({

                        success:false,

                        message:
                            'Selected doctor is unavailable.'
                    });
            }


            /* SLOT CONFLICT */

            const conflict =
                await sql`
                    SELECT id

                    FROM appointments

                    WHERE

                        doctor_id =
                            ${doctorId}

                        AND appointment_date =
                            ${appointmentDate}

                        AND appointment_time =
                            ${appointmentTime}

                        AND status NOT IN (
                            'CANCELLED',
                            'NO_SHOW'
                        )

                    LIMIT 1
                `;


            if (
                conflict.length
            ){

                return res
                    .status(409)
                    .json({

                        success:false,

                        message:
                            'This doctor already has an appointment at this time.'
                    });
            }


            const isTemporary =
                body.patientMode ===
                'temporary';


            let patientId =
                body.patientId
                ?
                Number(
                    body.patientId
                )
                :
                null;


            let patientName =
                String(
                    body.patientName ||
                    ''
                ).trim();


            let contactNo =
                String(
                    body.contactNo ||
                    ''
                ).trim();


            /* EXISTING */

            if (!isTemporary){

                if (!patientId){

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Select a registered patient.'
                        });
                }


                const patient =
                    await sql`
                        SELECT
                            id,
                            full_name,
                            phone

                        FROM patients

                        WHERE
                            id =
                                ${patientId}

                            AND active =
                                TRUE

                        LIMIT 1
                    `;


                if (!patient.length){

                    return res
                        .status(404)
                        .json({

                            success:false,

                            message:
                                'Patient not found.'
                        });
                }


                patientName =
                    patient[0]
                        .full_name;


                contactNo =
                    patient[0]
                        .phone ||
                    contactNo;
            }


            /* TEMPORARY */

            if (isTemporary){

                patientId =
                    null;


                if (
                    !patientName ||
                    !contactNo
                ){

                    return res
                        .status(400)
                        .json({

                            success:false,

                            message:
                                'Patient name and contact number are required.'
                        });
                }
            }


            /* INSERT */

            const result =
                await sql`
                    INSERT INTO appointments (

                        patient_id,
                        patient_name,
                        temporary_patient,

                        doctor_id,
                        service_id,

                        appointment_date,
                        appointment_time,

                        contact_no,

                        reason,
                        appointment_notes,

                        status,

                        created_by,

                        created_at,
                        updated_at

                    )

                    VALUES (

                        ${patientId},
                        ${patientName},
                        ${isTemporary},

                        ${doctorId},
                        ${serviceId},

                        ${appointmentDate},
                        ${appointmentTime},

                        ${contactNo || null},

                        ${notes || null},
                        ${notes || null},

                        'BOOKED',

                        ${user.id},

                        NOW(),
                        NOW()

                    )

                    RETURNING id
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
                    'CREATE_APPOINTMENT',
                    'appointments',
                    ${result[0].id},
                    'Appointment created'

                )
            `;


            return res
                .status(201)
                .json({

                    success:true,

                    appointmentId:
                        result[0].id
                });
        }


        return res
            .status(405)
            .json({

                success:false,

                message:
                    'Method not allowed.'
            });


    }catch(error){

        console.error(
            'APPOINTMENT ERROR:',
            error
        );


        return res
            .status(500)
            .json({

                success:false,

                message:
                    error.message ||
                    'Unable to process appointment.'
            });
    }
}
