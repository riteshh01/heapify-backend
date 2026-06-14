-- ============================================================================
-- THEORY ARTICLES
-- ============================================================================

INSERT INTO theory_articles (

    chapter_id,
    title,
    content,
    read_time_minutes,
    video_link

)

VALUES

-- ============================================================================
-- OPERATING SYSTEM
-- ============================================================================

(
    1,
    'What is an Operating System?',
    'An Operating System is system software that acts as an interface between user and computer hardware. It manages processes, memory, files and devices.',
    5,
    'https://youtube.com/example1'
),

(
    2,
    'What is a Process?',
    'A process is a program in execution. It contains program counter, stack, heap and data section.',
    6,
    'https://youtube.com/example2'
),

(
    2,
    'Process vs Thread',
    'Processes are heavyweight while threads are lightweight units of execution sharing same memory space.',
    8,
    'https://youtube.com/example3'
),

(
    3,
    'FCFS Scheduling',
    'First Come First Serve scheduling executes processes in the order they arrive.',
    5,
    'https://youtube.com/example4'
),

(
    5,
    'Deadlock Conditions',
    'Deadlock occurs when processes wait indefinitely for resources held by each other.',
    7,
    'https://youtube.com/example5'
);