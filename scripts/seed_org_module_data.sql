CREATE TABLE IF NOT EXISTS student_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id_card_no VARCHAR(30),
  household_location VARCHAR(100),
  household_address VARCHAR(255),
  graduate_school VARCHAR(120),
  gaokao_score INT,
  emergency_contact VARCHAR(60),
  emergency_phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id_card_no VARCHAR(30),
  education VARCHAR(20),
  degree VARCHAR(20),
  graduate_school VARCHAR(120),
  household_location VARCHAR(100),
  hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_details (
  course_id UUID PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  total_hours INT,
  theory_hours INT,
  practice_hours INT,
  exam_type VARCHAR(20) DEFAULT 'exam',
  course_nature VARCHAR(20) DEFAULT 'required',
  offering_department VARCHAR(120),
  textbook VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  v_college UUID;
  v_major_iot UUID;
  v_major_cs UUID;
  v_class_iot1 UUID;
  v_class_iot2 UUID;
  v_class_cs1 UUID;
  v_class_cs2 UUID;
BEGIN
  SELECT id INTO v_college FROM colleges WHERE code = 'SIE' LIMIT 1;
  SELECT id INTO v_major_iot FROM majors WHERE code = 'IOT' LIMIT 1;
  SELECT id INTO v_major_cs FROM majors WHERE code = 'CS' LIMIT 1;
  SELECT id INTO v_class_iot1 FROM classes WHERE name = '物联2401' LIMIT 1;
  SELECT id INTO v_class_iot2 FROM classes WHERE name = '物联2402' LIMIT 1;
  SELECT id INTO v_class_cs1 FROM classes WHERE name = '计科2401' LIMIT 1;
  SELECT id INTO v_class_cs2 FROM classes WHERE name = '计科2301' LIMIT 1;

  INSERT INTO users (username, password_hash, real_name, role, phone, email, college_id, major_id, class_id, title, status)
  VALUES
    ('T2024101', crypt('123456', gen_salt('bf')), '高老师', 'teacher', '13820000001', 'gao@univ.edu.cn', v_college, v_major_iot, NULL, '讲师', 'active'),
    ('T2024102', crypt('123456', gen_salt('bf')), '徐老师', 'teacher', '13820000002', 'xu@univ.edu.cn', v_college, v_major_iot, NULL, '副教授', 'active'),
    ('T2024103', crypt('123456', gen_salt('bf')), '马老师', 'teacher', '13820000003', 'ma@univ.edu.cn', v_college, v_major_cs, NULL, '讲师', 'active'),
    ('T2024104', crypt('123456', gen_salt('bf')), '何老师', 'teacher', '13820000004', 'he@univ.edu.cn', v_college, v_major_cs, NULL, '助教', 'inactive')
  ON CONFLICT (username) DO NOTHING;

  INSERT INTO users (username, password_hash, real_name, role, phone, email, college_id, major_id, class_id, status)
  VALUES
    ('20240001', crypt('123456', gen_salt('bf')), '张同学', 'student', '13910000001', '20240001@stu.edu.cn', v_college, v_major_iot, v_class_iot1, 'active'),
    ('20240002', crypt('123456', gen_salt('bf')), '李同学', 'student', '13910000002', '20240002@stu.edu.cn', v_college, v_major_iot, v_class_iot1, 'active'),
    ('20240003', crypt('123456', gen_salt('bf')), '赵同学', 'student', '13910000003', '20240003@stu.edu.cn', v_college, v_major_iot, v_class_iot2, 'inactive'),
    ('20240004', crypt('123456', gen_salt('bf')), '钱同学', 'student', '13910000004', '20240004@stu.edu.cn', v_college, v_major_iot, v_class_iot2, 'active'),
    ('20240005', crypt('123456', gen_salt('bf')), '周同学', 'student', '13910000005', '20240005@stu.edu.cn', v_college, v_major_cs, v_class_cs1, 'active'),
    ('20230006', crypt('123456', gen_salt('bf')), '吴同学', 'student', '13910000006', '20230006@stu.edu.cn', v_college, v_major_cs, v_class_cs2, 'locked')
  ON CONFLICT (username) DO NOTHING;
END $$;

UPDATE classes c
SET head_teacher_id = u.id
FROM users u
WHERE c.name = '物联2401' AND u.username = 'T2024101';

UPDATE classes c
SET head_teacher_id = u.id
FROM users u
WHERE c.name = '物联2402' AND u.username = 'T2024102';

UPDATE classes c
SET head_teacher_id = u.id
FROM users u
WHERE c.name = '计科2401' AND u.username = 'T2024103';

UPDATE classes c
SET head_teacher_id = u.id
FROM users u
WHERE c.name = '计科2301' AND u.username = 'T2024104';

INSERT INTO teacher_profiles (user_id, id_card_no, education, degree, graduate_school, household_location, hire_date)
SELECT u.id,
       CASE u.username
         WHEN 'T2024101' THEN '430522198701151238'
         WHEN 'T2024102' THEN '420102198512093119'
         WHEN 'T2024103' THEN '330106199004028812'
         WHEN 'T2024104' THEN '510108199305214514'
         ELSE '000000'
       END,
       CASE WHEN u.username IN ('T2024102') THEN '博士' WHEN u.username IN ('T2024104') THEN '本科' ELSE '硕士' END,
       CASE WHEN u.username IN ('T2024102') THEN '博士' WHEN u.username IN ('T2024104') THEN '学士' ELSE '硕士' END,
       CASE u.username
         WHEN 'T2024101' THEN '中南大学'
         WHEN 'T2024102' THEN '华中科技大学'
         WHEN 'T2024103' THEN '浙江大学'
         WHEN 'T2024104' THEN '电子科技大学'
         ELSE '未知'
       END,
       CASE u.username
         WHEN 'T2024101' THEN '湖南省邵阳市'
         WHEN 'T2024102' THEN '湖北省武汉市'
         WHEN 'T2024103' THEN '浙江省杭州市'
         WHEN 'T2024104' THEN '四川省成都市'
         ELSE '未知'
       END,
       CASE u.username
         WHEN 'T2024101' THEN '2015-09-01'::date
         WHEN 'T2024102' THEN '2012-03-15'::date
         WHEN 'T2024103' THEN '2018-07-01'::date
         WHEN 'T2024104' THEN '2022-02-20'::date
         ELSE NOW()::date
       END
FROM users u
WHERE u.role = 'teacher'
ON CONFLICT (user_id) DO UPDATE
SET id_card_no = EXCLUDED.id_card_no,
    education = EXCLUDED.education,
    degree = EXCLUDED.degree,
    graduate_school = EXCLUDED.graduate_school,
    household_location = EXCLUDED.household_location,
    hire_date = EXCLUDED.hire_date,
    updated_at = NOW();

INSERT INTO student_profiles (user_id, id_card_no, household_location, household_address, graduate_school, gaokao_score, emergency_contact, emergency_phone)
SELECT u.id,
       CASE u.username
         WHEN '20240001' THEN '430302200607018737'
         WHEN '20240002' THEN '430502200603155126'
         WHEN '20240003' THEN '440106200606219218'
         WHEN '20240004' THEN '320103200605302717'
         WHEN '20240005' THEN '370102200604120539'
         WHEN '20230006' THEN '330110200509048614'
         ELSE '000000'
       END,
       CASE u.username
         WHEN '20240001' THEN '湖南省株洲市'
         WHEN '20240002' THEN '湖南省邵阳市'
         WHEN '20240003' THEN '广东省广州市'
         WHEN '20240004' THEN '江苏省南京市'
         WHEN '20240005' THEN '山东省济南市'
         WHEN '20230006' THEN '浙江省杭州市'
         ELSE '未知'
       END,
       '示例户籍地址',
       CASE u.username
         WHEN '20240001' THEN '株洲市第一中学'
         WHEN '20240002' THEN '邵阳市第二中学'
         WHEN '20240003' THEN '广州市第七中学'
         WHEN '20240004' THEN '南京市金陵中学'
         WHEN '20240005' THEN '济南市实验中学'
         WHEN '20230006' THEN '杭州市第二中学'
         ELSE '未知'
       END,
       CASE u.username
         WHEN '20240001' THEN 586
         WHEN '20240002' THEN 571
         WHEN '20240003' THEN 603
         WHEN '20240004' THEN 592
         WHEN '20240005' THEN 618
         WHEN '20230006' THEN 566
         ELSE 550
       END,
       '家长',
       '13700000000'
FROM users u
WHERE u.role = 'student'
ON CONFLICT (user_id) DO UPDATE
SET id_card_no = EXCLUDED.id_card_no,
    household_location = EXCLUDED.household_location,
    household_address = EXCLUDED.household_address,
    graduate_school = EXCLUDED.graduate_school,
    gaokao_score = EXCLUDED.gaokao_score,
    emergency_contact = EXCLUDED.emergency_contact,
    emergency_phone = EXCLUDED.emergency_phone,
    updated_at = NOW();

INSERT INTO course_details (course_id, total_hours, theory_hours, practice_hours, exam_type, course_nature, offering_department, textbook)
SELECT c.id,
       CASE c.code WHEN 'IOT101' THEN 48 WHEN 'IOT201' THEN 56 WHEN 'IOT301' THEN 64 WHEN 'CS101' THEN 64 WHEN 'CS201' THEN 56 ELSE 32 END,
       CASE c.code WHEN 'IOT101' THEN 32 WHEN 'IOT201' THEN 28 WHEN 'IOT301' THEN 30 WHEN 'CS101' THEN 32 WHEN 'CS201' THEN 34 ELSE 20 END,
       CASE c.code WHEN 'IOT101' THEN 16 WHEN 'IOT201' THEN 28 WHEN 'IOT301' THEN 34 WHEN 'CS101' THEN 32 WHEN 'CS201' THEN 22 ELSE 12 END,
       CASE c.code WHEN 'IOT101' THEN 'assessment' ELSE 'exam' END,
       'required',
       '信息工程学院',
       CASE c.code
         WHEN 'IOT101' THEN '物联网技术与应用（第3版）'
         WHEN 'IOT201' THEN '现代传感器技术'
         WHEN 'IOT301' THEN 'ARM嵌入式开发实战'
         WHEN 'CS101' THEN 'C语言程序设计'
         WHEN 'CS201' THEN '数据结构（严蔚敏）'
         ELSE '通用教材'
       END
FROM courses c
ON CONFLICT (course_id) DO UPDATE
SET total_hours = EXCLUDED.total_hours,
    theory_hours = EXCLUDED.theory_hours,
    practice_hours = EXCLUDED.practice_hours,
    exam_type = EXCLUDED.exam_type,
    course_nature = EXCLUDED.course_nature,
    offering_department = EXCLUDED.offering_department,
    textbook = EXCLUDED.textbook,
    updated_at = NOW();

